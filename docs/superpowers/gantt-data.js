// The data of gantt.html: every phase, sub-plan and task of the modernization, with its status.
// Pure data: after "window.GANTT = " this is JSON, written by `npm run gantt` (scripts/gantt/update.ts);
// edit it through that script, or by hand as JSON. (A script file, not a .json: the chart is opened
// from disk, where a page may not load a JSON file.)
//
// updated   when the chart was last brought up to date ('YYYY-MM-DDTHH:mm', local time): the now line.
// items     one object per row, in display order:
//  id        unique. Phases '0'..'16', sub-plans '1A', '1B-1', ..., tasks '<plan>.<n>' (e.g. '1A.3').
//  kind      'phase' | 'plan' (sub-plan) | 'task'.
//  parent    id of the phase or sub-plan the row sits under (omit for phases).
//  name      label shown on the row.
//  status    tasks only: 'done' | 'review' (in review) | 'progress' | 'todo' | 'unplanned'.
//            Phases and sub-plans roll their status up from their tasks.
//  start, end  real local times for work already done or in progress (commit times). A task that
//            is done has them; a row without them is drawn right of the now line.
//  planning  on a plan: { start, end } of the work before its first task: prototype, the review
//            of the prototype, writing the plan (from the last commit before it to the commit of
//            the plan; waiting time in between is included).
//  review    on a phase or plan: { start, end } of the review after its last task and the fixes
//            that followed (from the last task's commit to the last commit of fixes).
//  size      relative length (units) for unscheduled work. One unit = half a day of real time.
//  dependsOn ids that must finish first; after: ids it merely follows.
//  scope, doneWhen  texts shown in the details.
window.GANTT = {
  "updated": "2026-11-05T11:03",
  "items": [
    {
      "id": "0",
      "review": {
        "start": "2026-10-10T13:49",
        "end": "2026-10-10T14:03"
      },
      "kind": "phase",
      "name": "Foundation",
      "dependsOn": [],
      "scope": "Toolchain, client, router, guards, Kysely baseline, deploy script, /help, CI",
      "doneWhen": "Bot logs in on staging with no privileged intents, responds to /help, CI runs lint + type-check + tests"
    },
    {
      "id": "0.1",
      "kind": "task",
      "parent": "0",
      "name": "Toolchain and configuration",
      "status": "done",
      "start": "2026-10-10T11:25",
      "end": "2026-10-10T11:32"
    },
    {
      "id": "0.2",
      "kind": "task",
      "parent": "0",
      "name": "Legacy schema fixture and MySQL test harness",
      "status": "done",
      "start": "2026-10-10T11:32",
      "end": "2026-10-10T11:37"
    },
    {
      "id": "0.3",
      "kind": "task",
      "parent": "0",
      "name": "Database connection, migrator and baseline",
      "status": "done",
      "start": "2026-10-10T11:37",
      "end": "2026-10-10T13:27"
    },
    {
      "id": "0.4",
      "kind": "task",
      "parent": "0",
      "name": "Generated database types and GuildRepository",
      "status": "done",
      "start": "2026-10-10T13:27",
      "end": "2026-10-10T13:30"
    },
    {
      "id": "0.5",
      "kind": "task",
      "parent": "0",
      "name": "User errors and component custom IDs",
      "status": "done",
      "start": "2026-10-10T13:30",
      "end": "2026-10-10T13:33"
    },
    {
      "id": "0.6",
      "kind": "task",
      "parent": "0",
      "name": "Discord client with optional intents",
      "status": "done",
      "start": "2026-10-10T13:33",
      "end": "2026-10-10T13:35"
    },
    {
      "id": "0.7",
      "kind": "task",
      "parent": "0",
      "name": "AppContext, command contracts and the interaction router",
      "status": "done",
      "start": "2026-10-10T13:35",
      "end": "2026-10-10T13:38"
    },
    {
      "id": "0.8",
      "kind": "task",
      "parent": "0",
      "name": "Guards",
      "status": "done",
      "start": "2026-10-10T13:38",
      "end": "2026-10-10T13:40"
    },
    {
      "id": "0.9",
      "kind": "task",
      "parent": "0",
      "name": "/help, the command registry and command deployment",
      "status": "done",
      "start": "2026-10-10T13:40",
      "end": "2026-10-10T13:43"
    },
    {
      "id": "0.10",
      "kind": "task",
      "parent": "0",
      "name": "App bootstrap, guild sync and graceful shutdown",
      "status": "done",
      "start": "2026-10-10T13:43",
      "end": "2026-10-10T13:44"
    },
    {
      "id": "0.11",
      "kind": "task",
      "parent": "0",
      "name": "CI, environment template, README and staging smoke check",
      "status": "done",
      "start": "2026-10-10T13:44",
      "end": "2026-10-10T13:48"
    },
    {
      "id": "1",
      "kind": "phase",
      "name": "Domain ports",
      "dependsOn": [
        "0"
      ],
      "scope": "Game data, time parsing, repositories, raid boss feed, search, image cache, static maps",
      "doneWhen": "Domain tests green, including legacy-parity cases; the boss list syncs from the live feed"
    },
    {
      "id": "1A",
      "planning": {
        "start": "2026-10-10T14:08",
        "end": "2026-10-10T14:20"
      },
      "kind": "plan",
      "parent": "1",
      "name": "1A Data access and time parsing",
      "review": {
        "start": "2026-10-10T14:48",
        "end": "2026-10-10T15:24"
      }
    },
    {
      "id": "1A.1",
      "kind": "task",
      "parent": "1A",
      "name": "Database housekeeping from Phase 0",
      "status": "done",
      "start": "2026-10-10T14:20",
      "end": "2026-10-10T14:31"
    },
    {
      "id": "1A.2",
      "kind": "task",
      "parent": "1A",
      "name": "Test settings fixture and log redaction",
      "status": "done",
      "start": "2026-10-10T14:35",
      "end": "2026-10-10T14:37"
    },
    {
      "id": "1A.3",
      "kind": "task",
      "parent": "1A",
      "name": "Party status constants and UserRepository",
      "status": "done",
      "start": "2026-10-10T14:31",
      "end": "2026-10-10T14:35"
    },
    {
      "id": "1A.4",
      "kind": "task",
      "parent": "1A",
      "name": "Geometry helpers and RegionRepository",
      "status": "done",
      "start": "2026-10-10T14:37",
      "end": "2026-10-10T14:39"
    },
    {
      "id": "1A.5",
      "kind": "task",
      "parent": "1A",
      "name": "GymRepository",
      "status": "done",
      "start": "2026-10-10T14:39",
      "end": "2026-10-10T14:43"
    },
    {
      "id": "1A.6",
      "kind": "task",
      "parent": "1A",
      "name": "Time-argument parsing",
      "status": "done",
      "start": "2026-10-10T14:43",
      "end": "2026-10-10T14:59"
    },
    {
      "id": "1B-1",
      "planning": {
        "start": "2026-10-10T15:44",
        "end": "2026-10-10T16:01"
      },
      "kind": "plan",
      "parent": "1",
      "name": "1B-1 Game data catalogue",
      "review": {
        "start": "2026-10-10T18:15",
        "end": "2026-10-10T18:35"
      }
    },
    {
      "id": "1B-1.1",
      "kind": "task",
      "parent": "1B-1",
      "name": "Types and the text file",
      "status": "done",
      "start": "2026-10-10T16:01",
      "end": "2026-10-10T17:13"
    },
    {
      "id": "1B-1.2",
      "kind": "task",
      "parent": "1B-1",
      "name": "Display names and Pokebattler names",
      "status": "done",
      "start": "2026-10-10T17:13",
      "end": "2026-10-10T17:21"
    },
    {
      "id": "1B-1.3",
      "kind": "task",
      "parent": "1B-1",
      "name": "Game-master parser and fixtures",
      "status": "done",
      "start": "2026-10-10T17:14",
      "end": "2026-10-10T17:42"
    },
    {
      "id": "1B-1.4",
      "kind": "task",
      "parent": "1B-1",
      "name": "CP maths and the catalogue",
      "status": "done",
      "start": "2026-10-10T17:21",
      "end": "2026-10-10T17:38"
    },
    {
      "id": "1B-1.5",
      "kind": "task",
      "parent": "1B-1",
      "name": "Legacy names, nicknames and the Pokemon table",
      "status": "done",
      "start": "2026-10-10T17:43",
      "end": "2026-10-10T17:55"
    },
    {
      "id": "1B-1.6",
      "kind": "task",
      "parent": "1B-1",
      "name": "Raid tiers and the notification codec",
      "status": "done",
      "start": "2026-10-10T17:24",
      "end": "2026-10-10T17:39"
    },
    {
      "id": "1B-1.7",
      "kind": "task",
      "parent": "1B-1",
      "name": "GameDataService and wiring",
      "status": "done",
      "start": "2026-10-10T17:46",
      "end": "2026-10-10T18:13"
    },
    {
      "id": "1B-1.8",
      "kind": "task",
      "parent": "1B-1",
      "name": "Final whole-branch review",
      "status": "done",
      "start": "2026-10-10T18:15",
      "end": "2026-10-10T18:44"
    },
    {
      "id": "1B-2",
      "planning": {
        "start": "2026-10-10T18:50",
        "end": "2026-10-10T19:32"
      },
      "review": {
        "start": "2026-10-10T20:06",
        "end": "2026-10-10T20:46"
      },
      "kind": "plan",
      "parent": "1",
      "name": "1B-2 Raid bosses",
      "dependsOn": [
        "1B-1"
      ]
    },
    {
      "id": "1B-2.1",
      "kind": "task",
      "parent": "1B-2",
      "name": "One identity per form",
      "status": "done",
      "start": "2026-10-10T19:36",
      "end": "2026-10-10T19:41"
    },
    {
      "id": "1B-2.2",
      "kind": "task",
      "parent": "1B-2",
      "name": "Reading the raid boss feed",
      "status": "done",
      "start": "2026-10-10T19:41",
      "end": "2026-10-10T19:51",
      "dependsOn": [
        "1B-2.1"
      ]
    },
    {
      "id": "1B-2.3",
      "kind": "task",
      "parent": "1B-2",
      "name": "The boss list in effect",
      "status": "done",
      "start": "2026-10-10T19:44",
      "end": "2026-10-10T19:53",
      "dependsOn": [
        "1B-2.2"
      ]
    },
    {
      "id": "1B-2.4",
      "kind": "task",
      "parent": "1B-2",
      "name": "Raid boss tables and repository",
      "status": "done",
      "start": "2026-10-10T19:53",
      "end": "2026-10-10T20:00",
      "dependsOn": [
        "1B-2.3"
      ]
    },
    {
      "id": "1B-2.5",
      "kind": "task",
      "parent": "1B-2",
      "name": "RaidBossService",
      "status": "done",
      "start": "2026-10-10T20:00",
      "end": "2026-10-10T20:21",
      "dependsOn": [
        "1B-2.4"
      ]
    },
    {
      "id": "1B-2.6",
      "kind": "task",
      "parent": "1B-2",
      "name": "Settings, wiring and the feed check",
      "status": "done",
      "start": "2026-10-10T20:03",
      "end": "2026-10-10T20:22",
      "dependsOn": [
        "1B-2.5"
      ]
    },
    {
      "id": "1B-2.7",
      "kind": "task",
      "parent": "1B-2",
      "name": "Final whole-branch review",
      "status": "done",
      "start": "2026-10-10T20:22",
      "end": "2026-10-10T20:44",
      "dependsOn": [
        "1B-2.6"
      ]
    },
    {
      "id": "1C",
      "planning": {
        "start": "2026-10-10T21:07",
        "end": "2026-10-10T22:15"
      },
      "review": {
        "start": "2026-10-10T22:51",
        "end": "2026-10-10T23:07"
      },
      "kind": "plan",
      "parent": "1",
      "name": "1C Search, image cache, static maps",
      "dependsOn": [
        "1A",
        "1B-2"
      ]
    },
    {
      "id": "1C.1",
      "kind": "task",
      "parent": "1C",
      "name": "Search text, short-list matching, status words and moves",
      "status": "done",
      "start": "2026-10-10T22:22",
      "end": "2026-10-10T22:31"
    },
    {
      "id": "1C.2",
      "kind": "task",
      "parent": "1C",
      "name": "Pokémon search",
      "status": "done",
      "start": "2026-10-10T22:24",
      "end": "2026-10-10T22:36",
      "dependsOn": [
        "1C.1"
      ]
    },
    {
      "id": "1C.3",
      "kind": "task",
      "parent": "1C",
      "name": "Address text, gyms by region, gym fixtures",
      "status": "done",
      "start": "2026-10-10T22:26",
      "end": "2026-10-10T22:28",
      "dependsOn": [
        "1C.2"
      ]
    },
    {
      "id": "1C.4",
      "kind": "task",
      "parent": "1C",
      "name": "Gym search",
      "status": "done",
      "start": "2026-10-10T22:33",
      "end": "2026-10-10T22:45",
      "dependsOn": [
        "1C.3"
      ]
    },
    {
      "id": "1C.5",
      "kind": "task",
      "parent": "1C",
      "name": "Image cache and static maps",
      "status": "done",
      "start": "2026-10-10T22:36",
      "end": "2026-10-10T22:38",
      "dependsOn": [
        "1C.4"
      ]
    },
    {
      "id": "1C.6",
      "kind": "task",
      "parent": "1C",
      "name": "The services and the wiring",
      "status": "done",
      "start": "2026-10-10T22:46",
      "end": "2026-10-10T22:51",
      "dependsOn": [
        "1C.5"
      ]
    },
    {
      "id": "1C.7",
      "kind": "task",
      "parent": "1C",
      "name": "Final whole-branch review",
      "status": "done",
      "start": "2026-10-10T22:52",
      "end": "2026-10-10T23:12",
      "dependsOn": [
        "1C.6"
      ]
    },
    {
      "id": "2",
      "kind": "phase",
      "name": "Raids on forums",
      "size": 4,
      "dependsOn": [
        "1"
      ],
      "scope": "Party model, PartyService, forum renderer, scheduler, buttons, party and raid commands, AccessService",
      "doneWhen": "Full raid lifecycle works on staging from /raid to archive, surviving a restart mid-raid"
    },
    {
      "id": "2A",
      "planning": {
        "start": "2026-10-10T23:14",
        "end": "2026-10-10T23:48"
      },
      "review": {
        "start": "2026-10-11T00:11",
        "end": "2026-10-11T00:29"
      },
      "kind": "plan",
      "parent": "2",
      "name": "2A Command framework",
      "dependsOn": [
        "1C"
      ]
    },
    {
      "id": "2A.1",
      "kind": "task",
      "parent": "2A",
      "name": "Test fakes for every kind of interaction",
      "status": "done",
      "start": "2026-10-10T23:48",
      "end": "2026-10-10T23:54"
    },
    {
      "id": "2A.2",
      "kind": "task",
      "parent": "2A",
      "name": "Subcommands",
      "status": "done",
      "start": "2026-10-10T23:54",
      "end": "2026-10-10T23:58",
      "dependsOn": [
        "2A.1"
      ]
    },
    {
      "id": "2A.3",
      "kind": "task",
      "parent": "2A",
      "name": "Deferral, throttles and private errors",
      "status": "done",
      "start": "2026-10-10T23:58",
      "end": "2026-10-11T00:00",
      "dependsOn": [
        "2A.2"
      ]
    },
    {
      "id": "2A.4",
      "kind": "task",
      "parent": "2A",
      "name": "Typed component handlers",
      "status": "done",
      "start": "2026-10-11T00:00",
      "end": "2026-10-11T00:02",
      "dependsOn": [
        "2A.3"
      ]
    },
    {
      "id": "2A.5",
      "kind": "task",
      "parent": "2A",
      "name": "Channel context, guards, and which commands are offered where",
      "status": "done",
      "start": "2026-10-11T00:02",
      "end": "2026-10-11T00:05",
      "dependsOn": [
        "2A.4"
      ]
    },
    {
      "id": "2A.6",
      "kind": "task",
      "parent": "2A",
      "name": "/help for subcommands, staff and long lists",
      "status": "done",
      "start": "2026-10-11T00:05",
      "end": "2026-10-11T00:07",
      "dependsOn": [
        "2A.5"
      ]
    },
    {
      "id": "2A.7",
      "kind": "task",
      "parent": "2A",
      "name": "Final whole-branch review",
      "status": "done",
      "start": "2026-10-11T00:07",
      "end": "2026-10-11T00:11",
      "dependsOn": [
        "2A.6"
      ]
    },
    {
      "id": "2B",
      "planning": {
        "start": "2026-10-11T00:52",
        "end": "2026-10-11T01:30"
      },
      "kind": "plan",
      "parent": "2",
      "name": "2B Party model, table and raid durations",
      "dependsOn": [
        "2A"
      ]
    },
    {
      "id": "2B.1",
      "kind": "task",
      "parent": "2B",
      "name": "Raid events and the durations in effect",
      "status": "done",
      "start": "2026-10-11T01:30",
      "end": "2026-10-11T01:57"
    },
    {
      "id": "2B.2",
      "kind": "task",
      "parent": "2B",
      "name": "Party table, forum columns of Region, pool time zone",
      "status": "done",
      "start": "2026-10-11T01:57",
      "end": "2026-10-11T01:39",
      "dependsOn": [
        "2B.1"
      ]
    },
    {
      "id": "2B.3",
      "kind": "task",
      "parent": "2B",
      "name": "The party as data, and what can be done to a raid",
      "status": "done",
      "start": "2026-10-11T01:39",
      "end": "2026-10-11T02:06",
      "dependsOn": [
        "2B.2"
      ]
    },
    {
      "id": "2B.4",
      "kind": "task",
      "parent": "2B",
      "name": "Attendance and groups",
      "status": "done",
      "start": "2026-10-11T02:06",
      "end": "2026-10-11T02:08",
      "dependsOn": [
        "2B.3"
      ]
    },
    {
      "id": "2B.5",
      "kind": "task",
      "parent": "2B",
      "name": "What the clock does: partyTick",
      "status": "done",
      "start": "2026-10-11T02:08",
      "end": "2026-10-11T02:09",
      "dependsOn": [
        "2B.4"
      ]
    },
    {
      "id": "2B.6",
      "kind": "task",
      "parent": "2B",
      "name": "The state document and PartyRepository",
      "status": "done",
      "start": "2026-10-11T02:09",
      "end": "2026-10-11T02:12",
      "dependsOn": [
        "2B.5"
      ]
    },
    {
      "id": "2B.7",
      "kind": "task",
      "parent": "2B",
      "name": "PartyStore, ctx.parties and requireParty",
      "status": "done",
      "start": "2026-10-11T02:12",
      "end": "2026-10-11T02:14",
      "dependsOn": [
        "2B.6"
      ]
    },
    {
      "id": "2B.8",
      "kind": "task",
      "parent": "2B",
      "name": "Final whole-branch review",
      "status": "done",
      "start": "2026-10-11T02:14",
      "end": "2026-10-11T02:53",
      "dependsOn": [
        "2B.7"
      ]
    },
    {
      "id": "2C",
      "planning": {
        "start": "2026-10-11T02:53",
        "end": "2026-10-11T03:33"
      },
      "kind": "plan",
      "parent": "2",
      "name": "2C Forum posts and /raid",
      "dependsOn": [
        "2B"
      ]
    },
    {
      "id": "2C.1",
      "kind": "task",
      "parent": "2C",
      "name": "Boss pictures from the feed",
      "status": "done",
      "start": "2026-10-11T03:33",
      "end": "2026-10-11T03:48"
    },
    {
      "id": "2C.2",
      "kind": "task",
      "parent": "2C",
      "name": "The renderer: raid post, summary, link line",
      "status": "done",
      "start": "2026-10-11T03:48",
      "end": "2026-10-11T03:54",
      "dependsOn": [
        "2C.1"
      ]
    },
    {
      "id": "2C.3",
      "kind": "task",
      "parent": "2C",
      "name": "The gateway to Discord, and its fake",
      "status": "done",
      "start": "2026-10-11T03:54",
      "end": "2026-10-11T03:43",
      "dependsOn": [
        "2C.2"
      ]
    },
    {
      "id": "2C.4",
      "kind": "task",
      "parent": "2C",
      "name": "Regions in memory, and a region by its forum",
      "status": "done",
      "start": "2026-10-11T03:43",
      "end": "2026-10-11T03:44",
      "dependsOn": [
        "2C.3"
      ]
    },
    {
      "id": "2C.5",
      "kind": "task",
      "parent": "2C",
      "name": "PartyService: reports, posts and summaries",
      "status": "done",
      "start": "2026-10-11T03:44",
      "end": "2026-10-11T03:57",
      "dependsOn": [
        "2C.4"
      ]
    },
    {
      "id": "2C.6",
      "kind": "task",
      "parent": "2C",
      "name": "/admin setup-forums",
      "status": "done",
      "start": "2026-10-11T03:57",
      "end": "2026-10-11T03:59",
      "dependsOn": [
        "2C.5"
      ]
    },
    {
      "id": "2C.7",
      "kind": "task",
      "parent": "2C",
      "name": "Reading what a raid report names",
      "status": "done",
      "start": "2026-10-11T03:59",
      "end": "2026-10-11T04:02",
      "dependsOn": [
        "2C.6"
      ]
    },
    {
      "id": "2C.8",
      "kind": "task",
      "parent": "2C",
      "name": "/raid, its gym menu and region confirmation",
      "status": "done",
      "start": "2026-10-11T04:02",
      "end": "2026-10-11T04:04",
      "dependsOn": [
        "2C.7"
      ]
    },
    {
      "id": "2C.9",
      "kind": "task",
      "parent": "2C",
      "name": "A debug line per handled interaction",
      "status": "done",
      "start": "2026-10-11T04:04",
      "end": "2026-10-11T04:05",
      "dependsOn": [
        "2C.8"
      ]
    },
    {
      "id": "2C.10",
      "kind": "task",
      "parent": "2C",
      "name": "Final whole-branch review",
      "status": "done",
      "start": "2026-10-11T04:05",
      "end": "2026-10-11T05:39",
      "dependsOn": [
        "2C.9"
      ]
    },
    {
      "id": "2C2",
      "planning": {
        "start": "2026-10-11T05:41",
        "end": "2026-10-11T05:43"
      },
      "review": {
        "start": "2026-10-11T05:54",
        "end": "2026-10-11T06:53"
      },
      "kind": "plan",
      "parent": "2",
      "name": "2C-2 Raid bosses from ScrapedDuck",
      "status": "done",
      "start": "2026-10-11T05:43",
      "end": "2026-10-11T06:55",
      "dependsOn": [
        "2C"
      ],
      "scope": "The boss feed reader replaced: ScrapedDuck raids.json, identity from picture and name; pokemon-go-api dropped"
    },
    {
      "id": "2D",
      "planning": {
        "start": "2026-10-11T06:55",
        "end": "2026-10-11T07:46",
        "review": {
          "start": "2026-10-11T07:25",
          "end": "2026-10-11T07:46"
        }
      },
      "review": {
        "start": "2026-10-11T08:04",
        "end": "2026-10-11T08:26"
      },
      "kind": "plan",
      "parent": "2",
      "name": "2D-1 Controls and attendance",
      "dependsOn": [
        "2C"
      ]
    },
    {
      "id": "2D.1",
      "kind": "task",
      "parent": "2D",
      "name": "State v2: name, team, prompts",
      "status": "done",
      "start": "2026-10-11T07:46",
      "end": "2026-10-11T07:49"
    },
    {
      "id": "2D.2",
      "kind": "task",
      "parent": "2D",
      "name": "Controls, team emoji, activity texts",
      "status": "done",
      "start": "2026-10-11T07:49",
      "end": "2026-10-11T07:52",
      "dependsOn": [
        "2D.1"
      ]
    },
    {
      "id": "2D.3",
      "kind": "task",
      "parent": "2D",
      "name": "Control throttle, who acts",
      "status": "done",
      "start": "2026-10-11T07:52",
      "end": "2026-10-11T07:54",
      "dependsOn": [
        "2D.2"
      ]
    },
    {
      "id": "2D.4",
      "kind": "task",
      "parent": "2D",
      "name": "AttendanceService",
      "status": "done",
      "start": "2026-10-11T07:54",
      "end": "2026-10-11T07:58",
      "dependsOn": [
        "2D.3"
      ]
    },
    {
      "id": "2D.5",
      "kind": "task",
      "parent": "2D",
      "name": "Buttons, attendance commands, /group",
      "status": "done",
      "start": "2026-10-11T07:58",
      "end": "2026-10-11T08:01",
      "dependsOn": [
        "2D.4"
      ]
    },
    {
      "id": "2D.6",
      "kind": "task",
      "parent": "2D",
      "name": "Reporter name and team",
      "status": "done",
      "start": "2026-10-11T08:01",
      "end": "2026-10-11T08:04",
      "dependsOn": [
        "2D.5"
      ]
    },
    {
      "id": "2D2",
      "planning": {
        "start": "2026-10-11T08:39",
        "end": "2026-10-11T10:09",
        "review": {
          "start": "2026-10-11T09:24",
          "end": "2026-10-11T10:09"
        }
      },
      "review": {
        "start": "2026-10-11T10:36",
        "end": "2026-10-11T10:56"
      },
      "kind": "plan",
      "parent": "2",
      "name": "2D-2 Scheduler and raid changes",
      "dependsOn": [
        "2D"
      ]
    },
    {
      "id": "2D2.1",
      "kind": "task",
      "parent": "2D2",
      "name": "State v3: a question knows whom it asked",
      "status": "done",
      "start": "2026-10-11T10:09",
      "end": "2026-10-11T10:14"
    },
    {
      "id": "2D2.2",
      "kind": "task",
      "parent": "2D2",
      "name": "Ending a party: archive, lock, sweep",
      "status": "done",
      "start": "2026-10-11T10:14",
      "end": "2026-10-11T10:17",
      "dependsOn": [
        "2D2.1"
      ]
    },
    {
      "id": "2D2.3",
      "kind": "task",
      "parent": "2D2",
      "name": "The party clock (PartyScheduler)",
      "status": "done",
      "start": "2026-10-11T10:17",
      "end": "2026-10-11T10:20",
      "dependsOn": [
        "2D2.2"
      ]
    },
    {
      "id": "2D2.4",
      "kind": "task",
      "parent": "2D2",
      "name": "Private answers to clicks, gathered",
      "status": "done",
      "start": "2026-10-11T10:20",
      "end": "2026-10-11T10:22",
      "dependsOn": [
        "2D2.3"
      ]
    },
    {
      "id": "2D2.5",
      "kind": "task",
      "parent": "2D2",
      "name": "RaidChangeService, meeting times, certain moves",
      "status": "done",
      "start": "2026-10-11T10:22",
      "end": "2026-10-11T10:26",
      "dependsOn": [
        "2D2.4"
      ]
    },
    {
      "id": "2D2.6",
      "kind": "task",
      "parent": "2D2",
      "name": "/hatch /end /duration /meet /cancel-meet, Set time",
      "status": "done",
      "start": "2026-10-11T10:26",
      "end": "2026-10-11T10:29",
      "dependsOn": [
        "2D2.5"
      ]
    },
    {
      "id": "2D2.7",
      "kind": "task",
      "parent": "2D2",
      "name": "/boss /moveset /location",
      "status": "done",
      "start": "2026-10-11T10:29",
      "end": "2026-10-11T10:31",
      "dependsOn": [
        "2D2.6"
      ]
    },
    {
      "id": "2D2.8",
      "kind": "task",
      "parent": "2D2",
      "name": "The clock in the app; lifecycle test in MySQL",
      "status": "done",
      "start": "2026-10-11T10:31",
      "end": "2026-10-11T10:34",
      "dependsOn": [
        "2D2.7"
      ]
    },
    {
      "id": "2D2.9",
      "kind": "task",
      "parent": "2D2",
      "name": "The archive warning again in a busy post",
      "status": "done",
      "start": "2026-10-11T10:34",
      "end": "2026-10-11T10:36",
      "dependsOn": [
        "2D2.8"
      ]
    },
    {
      "id": "2E",
      "planning": {
        "start": "2026-10-11T11:04",
        "end": "2026-10-11T12:25",
        "review": {
          "start": "2026-10-11T11:39",
          "end": "2026-10-11T12:25"
        }
      },
      "review": {
        "start": "2026-10-11T12:46",
        "end": "2026-10-11T13:19"
      },
      "kind": "plan",
      "parent": "2",
      "name": "2E-1 Mirrors and the last raid commands",
      "dependsOn": [
        "2D2"
      ]
    },
    {
      "id": "2E.1",
      "kind": "task",
      "parent": "2E",
      "name": "Gateway: edit a message, find a channel; mirror kinds",
      "status": "done",
      "start": "2026-10-11T12:25",
      "end": "2026-10-11T12:28"
    },
    {
      "id": "2E.2",
      "kind": "task",
      "parent": "2E",
      "name": "PartyMirrors: copies kept up to date, deleted at the end",
      "status": "done",
      "start": "2026-10-11T12:28",
      "end": "2026-10-11T12:32",
      "dependsOn": [
        "2E.1"
      ]
    },
    {
      "id": "2E.3",
      "kind": "task",
      "parent": "2E",
      "name": "/status and /where",
      "status": "done",
      "start": "2026-10-11T12:32",
      "end": "2026-10-11T12:34",
      "dependsOn": [
        "2E.2"
      ]
    },
    {
      "id": "2E.4",
      "kind": "task",
      "parent": "2E",
      "name": "/shout",
      "status": "done",
      "start": "2026-10-11T12:34",
      "end": "2026-10-11T12:36",
      "dependsOn": [
        "2E.3"
      ]
    },
    {
      "id": "2E.5",
      "kind": "task",
      "parent": "2E",
      "name": "/delete; defer decided per use",
      "status": "done",
      "start": "2026-10-11T12:36",
      "end": "2026-10-11T12:39",
      "dependsOn": [
        "2E.4"
      ]
    },
    {
      "id": "2E.6",
      "kind": "task",
      "parent": "2E",
      "name": "/admin save-party",
      "status": "done",
      "start": "2026-10-11T12:39",
      "end": "2026-10-11T12:42",
      "dependsOn": [
        "2E.5"
      ]
    },
    {
      "id": "2E.7",
      "kind": "task",
      "parent": "2E",
      "name": "Group autocomplete; help overview loses no command",
      "status": "done",
      "start": "2026-10-11T12:42",
      "end": "2026-10-11T12:44",
      "dependsOn": [
        "2E.6"
      ]
    },
    {
      "id": "2E.8",
      "kind": "task",
      "parent": "2E",
      "name": "Copies over a restart, in MySQL",
      "status": "done",
      "start": "2026-10-11T12:44",
      "end": "2026-10-11T12:46",
      "dependsOn": [
        "2E.7"
      ]
    },
    {
      "id": "2E2",
      "planning": {
        "start": "2026-10-11T13:19",
        "end": "2026-10-11T14:59",
        "review": {
          "start": "2026-10-11T14:05",
          "end": "2026-10-11T14:59"
        }
      },
      "kind": "plan",
      "parent": "2",
      "name": "2E-2 Access for other regions; moving a raid",
      "dependsOn": [
        "2E"
      ],
      "review": {
        "start": "2026-10-11T15:30",
        "end": "2026-10-11T15:49"
      }
    },
    {
      "id": "2E2.1",
      "kind": "task",
      "parent": "2E2",
      "name": "PartyAccessGrant table and repository",
      "status": "done",
      "start": "2026-10-11T14:59",
      "end": "2026-10-11T15:07"
    },
    {
      "id": "2E2.2",
      "kind": "task",
      "parent": "2E2",
      "name": "PartyStore tells listeners of every change",
      "status": "done",
      "dependsOn": [
        "2E2.1"
      ],
      "start": "2026-10-11T15:07",
      "end": "2026-10-11T15:09"
    },
    {
      "id": "2E2.3",
      "kind": "task",
      "parent": "2E2",
      "name": "Gateway: let a member into a forum, and out",
      "status": "done",
      "dependsOn": [
        "2E2.2"
      ],
      "start": "2026-10-11T15:09",
      "end": "2026-10-11T15:17"
    },
    {
      "id": "2E2.4",
      "kind": "task",
      "parent": "2E2",
      "name": "AccessService: grants follow the parties",
      "status": "done",
      "dependsOn": [
        "2E2.3"
      ],
      "start": "2026-10-11T15:17",
      "end": "2026-10-11T15:17"
    },
    {
      "id": "2E2.5",
      "kind": "task",
      "parent": "2E2",
      "name": "A raid moves to another region as a new party",
      "status": "done",
      "dependsOn": [
        "2E2.4"
      ],
      "start": "2026-10-11T15:17",
      "end": "2026-10-11T15:22"
    },
    {
      "id": "2E2.6",
      "kind": "task",
      "parent": "2E2",
      "name": "setGym across regions; gymMove",
      "status": "done",
      "dependsOn": [
        "2E2.5"
      ],
      "start": "2026-10-11T15:22",
      "end": "2026-10-11T15:24"
    },
    {
      "id": "2E2.7",
      "kind": "task",
      "parent": "2E2",
      "name": "The location command asks before a move",
      "status": "done",
      "dependsOn": [
        "2E2.6"
      ],
      "start": "2026-10-11T15:24",
      "end": "2026-10-11T15:27"
    },
    {
      "id": "2E2.8",
      "kind": "task",
      "parent": "2E2",
      "name": "Access and a move over a restart, in MySQL",
      "status": "done",
      "dependsOn": [
        "2E2.7"
      ],
      "start": "2026-10-11T15:27",
      "end": "2026-10-11T15:30"
    },
    {
      "id": "2S",
      "kind": "plan",
      "parent": "2",
      "name": "2S Staging on the test server (with Matt)",
      "status": "done",
      "size": 0.4,
      "dependsOn": [
        "2E2"
      ],
      "scope": "The four staging checklists, in order: 2D-1, 2D-2, 2E-1, 2E-2. Each step needs Matt's go-ahead."
    },
    {
      "id": "2S.1",
      "kind": "task",
      "parent": "2S",
      "name": "First part: everything one account can do",
      "status": "done",
      "start": "2026-10-11T16:05",
      "end": "2026-10-11T16:47"
    },
    {
      "id": "2S.2",
      "kind": "task",
      "parent": "2S",
      "name": "Fixes from the first part (wording, layout, the gym search)",
      "status": "done",
      "start": "2026-10-11T16:47",
      "end": "2026-10-11T17:05"
    },
    {
      "id": "2S.3",
      "kind": "task",
      "parent": "2S",
      "name": "Second part: with an ordinary second account",
      "status": "done",
      "start": "2026-10-12T12:27",
      "end": "2026-10-12T12:59"
    },
    {
      "id": "3",
      "kind": "phase",
      "name": "Trains and meetups",
      "size": 2,
      "dependsOn": [
        "2"
      ],
      "scope": "Train and meetup models, routes, conductor controls, saved routes, /info modal",
      "doneWhen": "Train and meetup lifecycles work on staging"
    },
    {
      "id": "3A",
      "kind": "plan",
      "parent": "3",
      "name": "3A Party kinds and meetups",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "2E2"
      ],
      "planning": {
        "start": "2026-10-11T17:14",
        "end": "2026-10-11T20:35",
        "review": {
          "start": "2026-10-11T19:00",
          "end": "2026-10-11T20:35"
        }
      },
      "review": {
        "start": "2026-10-11T20:58",
        "end": "2026-10-11T21:25"
      }
    },
    {
      "id": "3A.1",
      "kind": "task",
      "parent": "3A",
      "name": "Time reading for timed parties",
      "status": "done",
      "start": "2026-10-11T20:35",
      "end": "2026-10-11T20:38"
    },
    {
      "id": "3A.2",
      "kind": "task",
      "parent": "3A",
      "name": "A party is a raid or a meetup: the union, state document version 4",
      "status": "done",
      "start": "2026-10-11T20:38",
      "end": "2026-10-11T20:42"
    },
    {
      "id": "3A.3",
      "kind": "task",
      "parent": "3A",
      "name": "The domain of a meetup",
      "status": "done",
      "start": "2026-10-11T20:42",
      "end": "2026-10-11T20:45"
    },
    {
      "id": "3A.4",
      "kind": "task",
      "parent": "3A",
      "name": "The clock for both kinds",
      "status": "done",
      "start": "2026-10-11T20:45",
      "end": "2026-10-11T20:47"
    },
    {
      "id": "3A.5",
      "kind": "task",
      "parent": "3A",
      "name": "What a meetup shows: post, controls, the region list",
      "status": "done",
      "start": "2026-10-11T20:47",
      "end": "2026-10-11T20:51"
    },
    {
      "id": "3A.6",
      "kind": "task",
      "parent": "3A",
      "name": "PartyService and the scheduler for both kinds",
      "status": "done",
      "start": "2026-10-11T20:51",
      "end": "2026-10-11T20:54"
    },
    {
      "id": "3A.7",
      "kind": "task",
      "parent": "3A",
      "name": "The existing commands and controls in a meetup",
      "status": "done",
      "start": "2026-10-11T20:54",
      "end": "2026-10-11T20:56"
    },
    {
      "id": "3A.8",
      "kind": "task",
      "parent": "3A",
      "name": "The new commands: meetup, name, info",
      "status": "done",
      "start": "2026-10-11T20:56",
      "end": "2026-10-11T20:58"
    },
    {
      "id": "3B",
      "kind": "plan",
      "parent": "3",
      "name": "3B Trains (route, conductor, saved routes)",
      "status": "done",
      "size": 1.2,
      "dependsOn": [
        "3A"
      ],
      "planning": {
        "start": "2026-10-11T21:34",
        "end": "2026-10-12T03:20",
        "review": {
          "start": "2026-10-12T00:49",
          "end": "2026-10-12T03:20"
        }
      },
      "review": {
        "start": "2026-10-12T03:38",
        "end": "2026-10-12T04:11"
      }
    },
    {
      "id": "3B.1",
      "kind": "task",
      "parent": "3B",
      "name": "One skeleton for a change decided inside the store",
      "status": "done",
      "start": "2026-10-12T03:20",
      "end": "2026-10-12T03:23"
    },
    {
      "id": "3B.2",
      "kind": "task",
      "parent": "3B",
      "name": "A party is a raid, a meetup or a train: state document version 5",
      "status": "done",
      "start": "2026-10-12T03:23",
      "end": "2026-10-12T03:25"
    },
    {
      "id": "3B.3",
      "kind": "task",
      "parent": "3B",
      "name": "The domain of a train: route, movement, conductor, boss",
      "status": "done",
      "start": "2026-10-12T03:25",
      "end": "2026-10-12T03:27"
    },
    {
      "id": "3B.4",
      "kind": "task",
      "parent": "3B",
      "name": "The clock for a train",
      "status": "done",
      "start": "2026-10-12T03:27",
      "end": "2026-10-12T03:29"
    },
    {
      "id": "3B.5",
      "kind": "task",
      "parent": "3B",
      "name": "What a train shows: post, panel button, the region list",
      "status": "done",
      "start": "2026-10-12T03:29",
      "end": "2026-10-12T03:30"
    },
    {
      "id": "3B.6",
      "kind": "task",
      "parent": "3B",
      "name": "Trains on Discord: createTrain, the train service",
      "status": "done",
      "start": "2026-10-12T03:30",
      "end": "2026-10-12T03:32"
    },
    {
      "id": "3B.7",
      "kind": "task",
      "parent": "3B",
      "name": "Saved routes",
      "status": "done",
      "start": "2026-10-12T03:32",
      "end": "2026-10-12T03:34"
    },
    {
      "id": "3B.8",
      "kind": "task",
      "parent": "3B",
      "name": "The existing commands and controls in a train",
      "status": "done",
      "start": "2026-10-12T03:34",
      "end": "2026-10-12T03:36"
    },
    {
      "id": "3B.9",
      "kind": "task",
      "parent": "3B",
      "name": "The new commands and buttons: train, route, conductor, moves",
      "status": "done",
      "start": "2026-10-12T03:36",
      "end": "2026-10-12T03:38"
    },
    {
      "id": "3C",
      "kind": "plan",
      "parent": "3",
      "name": "3C Train copies in other regions, Finish taken back",
      "status": "done",
      "size": 0.4,
      "dependsOn": [
        "3B"
      ],
      "planning": {
        "start": "2026-10-12T07:33",
        "end": "2026-10-12T10:47",
        "review": {
          "start": "2026-10-12T09:34",
          "end": "2026-10-12T10:47"
        }
      },
      "review": {
        "start": "2026-10-12T10:53",
        "end": "2026-10-12T11:22"
      }
    },
    {
      "id": "3C.1",
      "kind": "task",
      "parent": "3C",
      "name": "A Finish that can be taken back: state document version 6",
      "status": "done",
      "start": "2026-10-12T10:47",
      "end": "2026-10-12T10:50"
    },
    {
      "id": "3C.2",
      "kind": "task",
      "parent": "3C",
      "name": "A copy of a train in every other region it stops in",
      "status": "done",
      "start": "2026-10-12T10:50",
      "end": "2026-10-12T10:53"
    },
    {
      "id": "3S",
      "kind": "plan",
      "parent": "3",
      "name": "3S Staging on the test server (with Matt)",
      "size": 0.4,
      "dependsOn": [
        "3C"
      ],
      "scope": "The staging checklists of 3A, 3B and 3C with two accounts, the fixes that came of them, and members named by their stored name."
    },
    {
      "id": "3S.1",
      "kind": "task",
      "parent": "3S",
      "name": "First part: meetups, trains, copies, with both accounts",
      "status": "done",
      "start": "2026-10-12T11:25",
      "end": "2026-10-12T12:20"
    },
    {
      "id": "3S.2",
      "kind": "task",
      "parent": "3S",
      "name": "Fix: an empty permission entry no longer keeps a member out",
      "status": "done",
      "start": "2026-10-12T12:20",
      "end": "2026-10-12T12:23"
    },
    {
      "id": "3S.3",
      "kind": "task",
      "parent": "3S",
      "name": "Second part: pings, a moved raid, routes, the clock",
      "status": "done",
      "start": "2026-10-12T12:27",
      "end": "2026-10-12T12:40"
    },
    {
      "id": "3S.4",
      "kind": "task",
      "parent": "3S",
      "name": "Fix: only a denial keeps a member out of a forum",
      "status": "done",
      "start": "2026-10-12T12:40",
      "end": "2026-10-12T12:44"
    },
    {
      "id": "3S.5",
      "kind": "task",
      "parent": "3S",
      "name": "Third part: kept meetup, throttle, two trains, lost copies",
      "status": "done",
      "start": "2026-10-12T12:59",
      "end": "2026-10-12T13:16"
    },
    {
      "id": "3S.6",
      "kind": "task",
      "parent": "3S",
      "name": "Fix: a typed duration is rounded up to the whole minute",
      "status": "done",
      "start": "2026-10-12T13:16",
      "end": "2026-10-12T13:22"
    },
    {
      "id": "3S.7",
      "kind": "task",
      "parent": "3S",
      "name": "Members named by their stored name, with the mention in a line",
      "status": "done",
      "start": "2026-10-12T13:22",
      "end": "2026-10-12T14:07"
    },
    {
      "id": "4",
      "kind": "phase",
      "name": "Notifications and members",
      "size": 3,
      "dependsOn": [
        "2"
      ],
      "scope": "DmSender, NotifyService, want/target commands, /settings, friend codes, /iam, /spawn",
      "doneWhen": "Notifications delivered on staging; latency logged"
    },
    {
      "id": "4A",
      "kind": "plan",
      "parent": "4",
      "name": "4A Member settings, wants, targets, friend codes",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "3S"
      ],
      "planning": {
        "start": "2026-10-12T14:07",
        "end": "2026-10-12T20:00",
        "review": {
          "start": "2026-10-12T16:00",
          "end": "2026-10-12T19:59"
        }
      },
      "review": {
        "start": "2026-10-12T20:35",
        "end": "2026-10-12T21:39"
      }
    },
    {
      "id": "4A.1",
      "kind": "task",
      "parent": "4A",
      "name": "Member settings are read in batches",
      "status": "done",
      "start": "2026-10-12T20:00",
      "end": "2026-10-12T20:05"
    },
    {
      "id": "4A.2",
      "kind": "task",
      "parent": "4A",
      "name": "The settings command",
      "status": "done",
      "start": "2026-10-12T20:05",
      "end": "2026-10-12T20:08"
    },
    {
      "id": "4A.3",
      "kind": "task",
      "parent": "4A",
      "name": "Wants: scope, tokens, typed targets, repository",
      "status": "done",
      "start": "2026-10-12T20:08",
      "end": "2026-10-12T20:11"
    },
    {
      "id": "4A.4",
      "kind": "task",
      "parent": "4A",
      "name": "The want, unwant, wants and unwant-all commands",
      "status": "done",
      "start": "2026-10-12T20:11",
      "end": "2026-10-12T20:14"
    },
    {
      "id": "4A.5",
      "kind": "task",
      "parent": "4A",
      "name": "Gym targets: repository and the target commands",
      "status": "done",
      "start": "2026-10-12T20:14",
      "end": "2026-10-12T20:18"
    },
    {
      "id": "4A.6",
      "kind": "task",
      "parent": "4A",
      "name": "Friend codes, in-game names, looking a member up",
      "status": "done",
      "start": "2026-10-12T20:18",
      "end": "2026-10-12T20:25"
    },
    {
      "id": "4A.7",
      "kind": "task",
      "parent": "4A",
      "name": "A want for one form, or for shadow raids only",
      "status": "done",
      "start": "2026-10-12T20:25",
      "end": "2026-10-12T20:35"
    },
    {
      "id": "4B",
      "kind": "plan",
      "parent": "4",
      "name": "4B Delivery: DMs, stop buttons, the spawn report, Unown",
      "status": "done",
      "size": 1.2,
      "dependsOn": [
        "4A"
      ],
      "planning": {
        "start": "2026-10-12T21:52",
        "end": "2026-10-13T03:29",
        "review": {
          "start": "2026-10-12T23:31",
          "end": "2026-10-13T02:47"
        }
      },
      "review": {
        "start": "2026-10-13T04:08",
        "end": "2026-10-13T08:45"
      }
    },
    {
      "id": "4B.1",
      "kind": "task",
      "parent": "4B",
      "name": "The image cache retries a rename",
      "status": "done",
      "start": "2026-10-13T03:29",
      "end": "2026-10-13T03:32"
    },
    {
      "id": "4B.2",
      "kind": "task",
      "parent": "4B",
      "name": "Reads by event; new-train per server",
      "status": "done",
      "start": "2026-10-13T03:32",
      "end": "2026-10-13T03:37"
    },
    {
      "id": "4B.3",
      "kind": "task",
      "parent": "4B",
      "name": "Members in batches: who can see a channel",
      "status": "done",
      "start": "2026-10-13T03:37",
      "end": "2026-10-13T03:42"
    },
    {
      "id": "4B.4",
      "kind": "task",
      "parent": "4B",
      "name": "DmSender: the queue, measured, drained",
      "status": "done",
      "start": "2026-10-13T03:42",
      "end": "2026-10-13T03:45"
    },
    {
      "id": "4B.5",
      "kind": "task",
      "parent": "4B",
      "name": "NotifyService: raids, once per reason",
      "status": "done",
      "start": "2026-10-13T03:45",
      "end": "2026-10-13T03:48"
    },
    {
      "id": "4B.6",
      "kind": "task",
      "parent": "4B",
      "name": "The stop buttons under a DM",
      "status": "done",
      "start": "2026-10-13T03:48",
      "end": "2026-10-13T03:51"
    },
    {
      "id": "4B.7",
      "kind": "task",
      "parent": "4B",
      "name": "DMs for a new train, boss-set, meeting times",
      "status": "done",
      "start": "2026-10-13T03:51",
      "end": "2026-10-13T03:55"
    },
    {
      "id": "4B.8",
      "kind": "task",
      "parent": "4B",
      "name": "Pokémon icons: a picture for every entry",
      "status": "done",
      "start": "2026-10-13T03:55",
      "end": "2026-10-13T03:59"
    },
    {
      "id": "4B.9",
      "kind": "task",
      "parent": "4B",
      "name": "The spawn report (wild) and the Unown channel",
      "status": "done",
      "start": "2026-10-13T03:59",
      "end": "2026-10-13T04:03"
    },
    {
      "id": "4B.10",
      "kind": "task",
      "parent": "4B",
      "name": "An Unown want for holders of the old role",
      "status": "done",
      "start": "2026-10-13T04:03",
      "end": "2026-10-13T04:08"
    },
    {
      "id": "4C",
      "kind": "plan",
      "parent": "4",
      "name": "4C Self-assigned roles: /iam with menus, /iamnot, role groups",
      "status": "done",
      "size": 0.8,
      "dependsOn": [
        "4B"
      ],
      "planning": {
        "start": "2026-10-13T04:09",
        "end": "2026-10-13T10:09",
        "review": {
          "start": "2026-10-13T04:56",
          "end": "2026-10-13T10:09"
        }
      },
      "review": {
        "start": "2026-10-13T10:13",
        "end": "2026-10-13T10:48"
      }
    },
    {
      "id": "4C.1",
      "kind": "task",
      "parent": "4C",
      "name": "Roles: the row and its Discord role, groups, the rules",
      "status": "done",
      "start": "2026-10-13T10:09",
      "end": "2026-10-13T10:10"
    },
    {
      "id": "4C.2",
      "kind": "task",
      "parent": "4C",
      "name": "Roles on Discord: the gateway, its fake, the service",
      "status": "done",
      "start": "2026-10-13T10:10",
      "end": "2026-10-13T10:10"
    },
    {
      "id": "4C.3",
      "kind": "task",
      "parent": "4C",
      "name": "Staff: the self-roles part of the admin command",
      "status": "done",
      "start": "2026-10-13T10:10",
      "end": "2026-10-13T10:11"
    },
    {
      "id": "4C.4",
      "kind": "task",
      "parent": "4C",
      "name": "The iam and iamnot commands",
      "status": "done",
      "start": "2026-10-13T10:11",
      "end": "2026-10-13T10:11"
    },
    {
      "id": "4C.5",
      "kind": "task",
      "parent": "4C",
      "name": "The menus of iam: one per group, pages",
      "status": "done",
      "start": "2026-10-13T10:11",
      "end": "2026-10-13T10:13"
    },
    {
      "id": "4S",
      "kind": "plan",
      "parent": "4",
      "name": "4S Staging on the test server (with Matt)",
      "status": "done",
      "size": 0.4,
      "dependsOn": [
        "4C"
      ],
      "scope": "The staging checklists at the end of the 4A, 4B and 4C plans; deploy-commands by Matt first; 4B needs the second account."
    },
    {
      "id": "4S.1",
      "kind": "task",
      "parent": "4S",
      "name": "4A: settings, wants, gym targets, friend codes",
      "status": "done",
      "start": "2026-10-13T13:45",
      "end": "2026-10-13T14:26"
    },
    {
      "id": "4S.2",
      "kind": "task",
      "parent": "4S",
      "name": "4B: DMs, stop buttons, the spawn report (two accounts)",
      "status": "done",
      "start": "2026-10-13T14:10",
      "end": "2026-10-13T15:25"
    },
    {
      "id": "4S.3",
      "kind": "task",
      "parent": "4S",
      "name": "4C: self-assigned roles and their menus",
      "status": "done",
      "start": "2026-10-13T14:52",
      "end": "2026-10-13T15:38"
    },
    {
      "id": "4F",
      "kind": "plan",
      "parent": "4",
      "name": "4F Fixes from the staging of Phase 4; the EX raid tier removed",
      "status": "done",
      "size": 0.6,
      "dependsOn": [
        "5A"
      ],
      "scope": "The order of the /want choices, /wild (details required, what is never wild), privacy and auto-status for trains, /iam menus giving only new ticks, speed, small wording; EX tier removed, EX wants become elite wants.",
      "planning": {
        "start": "2026-10-13T16:53",
        "end": "2026-10-13T20:04",
        "review": {
          "start": "2026-10-13T17:49",
          "end": "2026-10-13T19:50"
        }
      },
      "review": {
        "start": "2026-10-13T20:12",
        "end": "2026-10-13T20:43"
      }
    },
    {
      "id": "4F.1",
      "kind": "task",
      "parent": "4F",
      "name": "The class of a Pokémon; what appears in the wild",
      "status": "done",
      "start": "2026-10-13T20:04",
      "end": "2026-10-13T20:04"
    },
    {
      "id": "4F.2",
      "kind": "task",
      "parent": "4F",
      "name": "Search order; the want and boss lists",
      "status": "done",
      "start": "2026-10-13T20:04",
      "end": "2026-10-13T20:05"
    },
    {
      "id": "4F.3",
      "kind": "task",
      "parent": "4F",
      "name": "Wild: details required, refusals",
      "status": "done",
      "start": "2026-10-13T20:05",
      "end": "2026-10-13T20:06"
    },
    {
      "id": "4F.4",
      "kind": "task",
      "parent": "4F",
      "name": "Trains under privacy and auto-status",
      "status": "done",
      "start": "2026-10-13T20:06",
      "end": "2026-10-13T20:07"
    },
    {
      "id": "4F.5",
      "kind": "task",
      "parent": "4F",
      "name": "Role menus; small wordings",
      "status": "done",
      "start": "2026-10-13T20:07",
      "end": "2026-10-13T20:08"
    },
    {
      "id": "4F.6",
      "kind": "task",
      "parent": "4F",
      "name": "The EX raid tier removed",
      "status": "done",
      "start": "2026-10-13T20:08",
      "end": "2026-10-13T20:09"
    },
    {
      "id": "4F.7",
      "kind": "task",
      "parent": "4F",
      "name": "Speed: row ids remembered",
      "status": "done",
      "start": "2026-10-13T20:09",
      "end": "2026-10-13T20:12"
    },
    {
      "id": "5",
      "kind": "phase",
      "name": "Admin",
      "size": 3,
      "dependsOn": [
        "1",
        "2A"
      ],
      "scope": "/gym modals, /region KML, /admin boss overrides and sync, self-roles, member settings",
      "doneWhen": "Admin flows work on staging against a copy of production data"
    },
    {
      "id": "5A",
      "kind": "plan",
      "parent": "5",
      "name": "5A Gyms: /gym add, edit, move, delete, show, export; geocoding and places",
      "status": "done",
      "size": 1.2,
      "dependsOn": [
        "4C"
      ],
      "planning": {
        "start": "2026-10-13T12:43",
        "end": "2026-10-13T15:36",
        "review": {
          "start": "2026-10-13T13:48",
          "end": "2026-10-13T15:19"
        }
      },
      "review": {
        "start": "2026-10-13T15:44",
        "end": "2026-10-13T16:31"
      }
    },
    {
      "id": "5A.1",
      "kind": "task",
      "parent": "5A",
      "name": "Gym rules: a location, the texts, the nearest gym, the export",
      "status": "done",
      "start": "2026-10-13T15:36",
      "end": "2026-10-13T15:37"
    },
    {
      "id": "5A.2",
      "kind": "task",
      "parent": "5A",
      "name": "Gym upkeep: Google behind a port, address and places",
      "status": "done",
      "start": "2026-10-13T15:37",
      "end": "2026-10-13T15:38"
    },
    {
      "id": "5A.3",
      "kind": "task",
      "parent": "5A",
      "name": "Elite raid gyms instead of EX gyms",
      "status": "done",
      "start": "2026-10-13T15:38",
      "end": "2026-10-13T15:38"
    },
    {
      "id": "5A.4",
      "kind": "task",
      "parent": "5A",
      "name": "The gym administration service",
      "status": "done",
      "start": "2026-10-13T15:38",
      "end": "2026-10-13T15:39"
    },
    {
      "id": "5A.5",
      "kind": "task",
      "parent": "5A",
      "name": "The gym command: show and add, guarded autocomplete",
      "status": "done",
      "start": "2026-10-13T15:39",
      "end": "2026-10-13T15:40"
    },
    {
      "id": "5A.6",
      "kind": "task",
      "parent": "5A",
      "name": "The gym command: edit, move, elite",
      "status": "done",
      "start": "2026-10-13T15:40",
      "end": "2026-10-13T15:41"
    },
    {
      "id": "5A.7",
      "kind": "task",
      "parent": "5A",
      "name": "The gym command: delete, refresh, export",
      "status": "done",
      "start": "2026-10-13T15:41",
      "end": "2026-10-13T15:44"
    },
    {
      "id": "5F",
      "kind": "plan",
      "parent": "5",
      "name": "5F Fixes from the staging of 5A and 4F; late deferral; forum name and lock",
      "status": "done",
      "size": 0.3,
      "dependsOn": [
        "4F"
      ],
      "scope": "No guesses for /want shadow, spawn reports cleaned up after a restart, a readable address in /gym show, an anonymous train maker not named, short commands answered without deferring, region forums closed to posts by members and named by a setting. Done by the controller without a prototype; one review of the diff.",
      "review": {
        "start": "2026-10-13T22:19",
        "end": "2026-10-13T22:28"
      }
    },
    {
      "id": "5F.1",
      "kind": "task",
      "parent": "5F",
      "name": "No guesses for a fixed word in the want list",
      "status": "done",
      "start": "2026-10-13T21:43",
      "end": "2026-10-13T21:51"
    },
    {
      "id": "5F.2",
      "kind": "task",
      "parent": "5F",
      "name": "Spawn reports recorded, deleted after a restart",
      "status": "done",
      "start": "2026-10-13T21:51",
      "end": "2026-10-13T21:52"
    },
    {
      "id": "5F.3",
      "kind": "task",
      "parent": "5F",
      "name": "Gym show: one address line",
      "status": "done",
      "start": "2026-10-13T21:52",
      "end": "2026-10-13T21:56"
    },
    {
      "id": "5F.4",
      "kind": "task",
      "parent": "5F",
      "name": "An anonymous train maker is not named in lines",
      "status": "done",
      "start": "2026-10-13T21:56",
      "end": "2026-10-13T21:59"
    },
    {
      "id": "5F.5",
      "kind": "task",
      "parent": "5F",
      "name": "Late deferral of short commands",
      "status": "done",
      "start": "2026-10-13T21:59",
      "end": "2026-10-13T22:16"
    },
    {
      "id": "5F.6",
      "kind": "task",
      "parent": "5F",
      "name": "Forums closed to posts by members",
      "status": "done",
      "start": "2026-10-13T22:16",
      "end": "2026-10-13T22:19"
    },
    {
      "id": "5F.7",
      "kind": "task",
      "parent": "5F",
      "name": "Review fixes; the forum name from the settings",
      "status": "done",
      "start": "2026-10-13T22:19",
      "end": "2026-10-13T22:28"
    },
    {
      "id": "5F.8",
      "kind": "task",
      "parent": "5F",
      "name": "An anonymous reporter is not named in a raid's lines; staging of the round",
      "status": "done",
      "start": "2026-10-13T22:28",
      "end": "2026-10-13T22:41"
    },
    {
      "id": "5B",
      "kind": "plan",
      "parent": "5",
      "name": "5B Regions: /region import (KML), bounds, remove",
      "status": "done",
      "size": 0.9,
      "dependsOn": [
        "5F"
      ],
      "planning": {
        "start": "2026-10-13T22:57",
        "end": "2026-10-14T01:15",
        "review": {
          "start": "2026-10-13T23:51",
          "end": "2026-10-14T01:08"
        }
      },
      "review": {
        "start": "2026-10-14T01:19",
        "end": "2026-10-14T02:08"
      }
    },
    {
      "id": "5B.1",
      "kind": "task",
      "parent": "5B",
      "name": "Regions from KML: reading a file, outlines, the plan of an import",
      "status": "done",
      "start": "2026-10-14T01:15",
      "end": "2026-10-14T01:16"
    },
    {
      "id": "5B.2",
      "kind": "task",
      "parent": "5B",
      "name": "Regions: downloading an attachment, the channels of a server, storage",
      "status": "done",
      "start": "2026-10-14T01:16",
      "end": "2026-10-14T01:17"
    },
    {
      "id": "5B.3",
      "kind": "task",
      "parent": "5B",
      "name": "Region administration: import, list, export and removal as a service",
      "status": "done",
      "start": "2026-10-14T01:17",
      "end": "2026-10-14T01:17"
    },
    {
      "id": "5B.4",
      "kind": "task",
      "parent": "5B",
      "name": "The region commands: list and export for staff, bounds for members",
      "status": "done",
      "start": "2026-10-14T01:17",
      "end": "2026-10-14T01:18"
    },
    {
      "id": "5B.5",
      "kind": "task",
      "parent": "5B",
      "name": "Importing regions from a KML file, with a preview first",
      "status": "done",
      "start": "2026-10-14T01:18",
      "end": "2026-10-14T01:18"
    },
    {
      "id": "5B.6",
      "kind": "task",
      "parent": "5B",
      "name": "Removing a region, and the forums whose region is gone",
      "status": "done",
      "start": "2026-10-14T01:18",
      "end": "2026-10-14T01:19"
    },
    {
      "id": "5C",
      "kind": "plan",
      "parent": "5",
      "name": "5C Boss overrides and announcements, member settings, role-authorization export",
      "status": "done",
      "size": 0.9,
      "dependsOn": [
        "5B"
      ],
      "planning": {
        "start": "2026-10-14T02:20",
        "end": "2026-10-14T02:51",
        "review": {
          "start": "2026-10-14T01:31",
          "end": "2026-10-14T02:40"
        }
      },
      "review": {
        "start": "2026-10-14T02:55",
        "end": "2026-10-14T03:24"
      }
    },
    {
      "id": "5C.1",
      "kind": "task",
      "parent": "5C",
      "name": "The boss list and the nicknames for staff, and help for a group of subcommands",
      "status": "done",
      "start": "2026-10-14T02:51",
      "end": "2026-10-14T02:52"
    },
    {
      "id": "5C.2",
      "kind": "task",
      "parent": "5C",
      "name": "The raid boss list for staff: list and sync",
      "status": "done",
      "start": "2026-10-14T02:52",
      "end": "2026-10-14T02:53"
    },
    {
      "id": "5C.3",
      "kind": "task",
      "parent": "5C",
      "name": "Overrides of the raid boss list: add, hide, autoset, shiny, remove",
      "status": "done",
      "start": "2026-10-14T02:53",
      "end": "2026-10-14T02:53"
    },
    {
      "id": "5C.4",
      "kind": "task",
      "parent": "5C",
      "name": "Announcing a changed raid boss list, and a list that is out of date",
      "status": "done",
      "start": "2026-10-14T02:53",
      "end": "2026-10-14T02:54"
    },
    {
      "id": "5C.5",
      "kind": "task",
      "parent": "5C",
      "name": "Pokemon nicknames for staff, and a member's settings for staff",
      "status": "done",
      "start": "2026-10-14T02:54",
      "end": "2026-10-14T02:54"
    },
    {
      "id": "5C.6",
      "kind": "task",
      "parent": "5C",
      "name": "The export of the legacy role authorization for the cutover",
      "status": "done",
      "start": "2026-10-14T02:54",
      "end": "2026-10-14T02:55"
    },
    {
      "id": "6",
      "kind": "phase",
      "name": "Utilities",
      "size": 2,
      "dependsOn": [
        "1"
      ],
      "after": [
        "2"
      ],
      "scope": "/rank, /counters, /find-region, /maps, /boss-tier, /request",
      "doneWhen": "Each command verified on staging"
    },
    {
      "id": "6A",
      "kind": "plan",
      "parent": "6",
      "name": "6A /rank, /boss-tier, /maps, /find-gym, /request",
      "status": "done",
      "size": 0.9,
      "dependsOn": [
        "5C"
      ],
      "planning": {
        "start": "2026-10-14T03:30",
        "end": "2026-10-14T04:26",
        "review": {
          "start": "2026-10-14T03:18",
          "end": "2026-10-14T04:14"
        }
      },
      "review": {
        "start": "2026-10-14T04:30",
        "end": "2026-10-14T04:52"
      }
    },
    {
      "id": "6A.1",
      "kind": "task",
      "parent": "6A",
      "name": "PvP ranking of IVs, and the evolutions of every Pokemon",
      "status": "done",
      "start": "2026-10-14T04:26",
      "end": "2026-10-14T04:27"
    },
    {
      "id": "6A.2",
      "kind": "task",
      "parent": "6A",
      "name": "The PvP rank of a Pokemon with given IVs: rank",
      "status": "done",
      "start": "2026-10-14T04:27",
      "end": "2026-10-14T04:28"
    },
    {
      "id": "6A.3",
      "kind": "task",
      "parent": "6A",
      "name": "Whether a Pokemon is a raid boss now, and the map of the regions",
      "status": "done",
      "start": "2026-10-14T04:28",
      "end": "2026-10-14T04:28"
    },
    {
      "id": "6A.4",
      "kind": "task",
      "parent": "6A",
      "name": "A gym look-up for members: find-gym",
      "status": "done",
      "start": "2026-10-14T04:28",
      "end": "2026-10-14T04:29"
    },
    {
      "id": "6A.5",
      "kind": "task",
      "parent": "6A",
      "name": "Gym requests from members as GitHub issues: request",
      "status": "done",
      "start": "2026-10-14T04:29",
      "end": "2026-10-14T04:30"
    },
    {
      "id": "6B",
      "kind": "plan",
      "parent": "6",
      "name": "6B /counters (Pokebattler), /find-region (Nominatim)",
      "status": "done",
      "size": 0.8,
      "dependsOn": [
        "6A"
      ],
      "planning": {
        "start": "2026-10-14T04:58",
        "end": "2026-10-14T05:11",
        "review": {
          "start": "2026-10-14T04:02",
          "end": "2026-10-14T04:59"
        }
      },
      "review": {
        "start": "2026-10-14T05:11",
        "end": "2026-10-14T05:52"
      }
    },
    {
      "id": "6B.1",
      "kind": "task",
      "parent": "6B",
      "name": "Pokebattler raid simulations: the option tables and the port",
      "status": "done",
      "start": "2026-10-14T05:11",
      "end": "2026-10-14T05:11"
    },
    {
      "id": "6B.2",
      "kind": "task",
      "parent": "6B",
      "name": "Counters against a raid boss from Pokebattler: counters",
      "status": "done",
      "start": "2026-10-14T05:11",
      "end": "2026-10-14T05:11"
    },
    {
      "id": "6B.3",
      "kind": "task",
      "parent": "6B",
      "name": "Places by name from Nominatim, and which regions a place touches",
      "status": "done",
      "start": "2026-10-14T05:11",
      "end": "2026-10-14T05:11"
    },
    {
      "id": "6B.4",
      "kind": "task",
      "parent": "6B",
      "name": "Which regions a place lies in: find-region",
      "status": "done",
      "start": "2026-10-14T05:11",
      "end": "2026-10-14T05:11"
    },
    {
      "id": "6S",
      "kind": "plan",
      "parent": "6",
      "name": "6S Staging of 5B, 5C, 6A and 6B (with Matt)",
      "status": "done",
      "size": 0.3,
      "dependsOn": [
        "6B"
      ],
      "scope": "The staging checklists at the end of the 5B, 5C, 6A and 6B plans, with both accounts; /rank and /counters in a DM after a global registration (since then the only one of the dev application)."
    },
    {
      "id": "6S.1",
      "kind": "task",
      "parent": "6S",
      "name": "5B: region import, export, list, remove, bounds",
      "status": "done",
      "start": "2026-10-14T07:36",
      "end": "2026-10-14T07:45"
    },
    {
      "id": "6S.2",
      "kind": "task",
      "parent": "6S",
      "name": "5C: boss administration, nicknames, member settings",
      "status": "done",
      "start": "2026-10-14T07:45",
      "end": "2026-10-14T07:55"
    },
    {
      "id": "6S.3",
      "kind": "task",
      "parent": "6S",
      "name": "6A and 6B: rank, boss-tier, maps, find-gym, counters, find-region",
      "status": "done",
      "start": "2026-10-14T07:55",
      "end": "2026-10-14T08:10"
    },
    {
      "id": "6S.4",
      "kind": "task",
      "parent": "6S",
      "name": "Announcements, request, the DM commands, the second account",
      "status": "done",
      "start": "2026-10-14T09:01",
      "end": "2026-10-14T09:31"
    },
    {
      "id": "6F",
      "kind": "plan",
      "parent": "6",
      "name": "6F Fixes from the staging of 5B, 5C, 6A and 6B",
      "status": "done",
      "size": 0.2,
      "dependsOn": [
        "6S"
      ],
      "scope": "The unchanged outline after Import, nicknames in the boss list of /raid, /find-region near the edge of the regions and towns before roads, megas in /rank; wording of /boss-tier, /request, /counters, the GitHub log, the place of a new forum. Done by the controller without a prototype; one review of the diff.",
      "review": {
        "start": "2026-10-14T09:54",
        "end": "2026-10-14T10:06"
      }
    },
    {
      "id": "6F.1",
      "kind": "task",
      "parent": "6F",
      "name": "An unchanged outline is called unchanged after Import",
      "status": "done",
      "start": "2026-10-14T09:34",
      "end": "2026-10-14T09:34"
    },
    {
      "id": "6F.2",
      "kind": "task",
      "parent": "6F",
      "name": "A nickname finds its boss in the boss list of /raid",
      "status": "done",
      "start": "2026-10-14T09:34",
      "end": "2026-10-14T09:37"
    },
    {
      "id": "6F.3",
      "kind": "task",
      "parent": "6F",
      "name": "Find-region: a margin around the regions, towns before roads",
      "status": "done",
      "start": "2026-10-14T09:37",
      "end": "2026-10-14T09:41"
    },
    {
      "id": "6F.4",
      "kind": "task",
      "parent": "6F",
      "name": "Rank: megas and primals are ranked",
      "status": "done",
      "start": "2026-10-14T09:41",
      "end": "2026-10-14T09:43"
    },
    {
      "id": "6F.5",
      "kind": "task",
      "parent": "6F",
      "name": "Boss-tier: a boss that can be shiny says so in words",
      "status": "done",
      "start": "2026-10-14T09:43",
      "end": "2026-10-14T09:46"
    },
    {
      "id": "6F.6",
      "kind": "task",
      "parent": "6F",
      "name": "Member settings: the Pokebattler id pinned by a test",
      "status": "done",
      "start": "2026-10-14T09:46",
      "end": "2026-10-14T09:48"
    },
    {
      "id": "6F.7",
      "kind": "task",
      "parent": "6F",
      "name": "Request: in the post of a party that ended, says so",
      "status": "done",
      "start": "2026-10-14T09:48",
      "end": "2026-10-14T09:49"
    },
    {
      "id": "6F.8",
      "kind": "task",
      "parent": "6F",
      "name": "A GitHub refusal is logged with a word for its kind",
      "status": "done",
      "start": "2026-10-14T09:49",
      "end": "2026-10-14T09:51"
    },
    {
      "id": "6F.9",
      "kind": "task",
      "parent": "6F",
      "name": "Counters: Pokebattler names by the catalogue",
      "status": "done",
      "start": "2026-10-14T09:51",
      "end": "2026-10-14T09:53"
    },
    {
      "id": "6F.10",
      "kind": "task",
      "parent": "6F",
      "name": "A new forum after the last forum of its category",
      "status": "done",
      "start": "2026-10-14T09:53",
      "end": "2026-10-14T09:54"
    },
    {
      "id": "6F.11",
      "kind": "task",
      "parent": "6F",
      "name": "Review: GitHub answers read with a byte limit",
      "status": "done",
      "start": "2026-10-14T09:54",
      "end": "2026-10-14T10:04"
    },
    {
      "id": "6F.12",
      "kind": "task",
      "parent": "6F",
      "name": "Review: the summary post of a forum has not ended",
      "status": "done",
      "start": "2026-10-14T10:04",
      "end": "2026-10-14T10:05"
    },
    {
      "id": "6F.13",
      "kind": "task",
      "parent": "6F",
      "name": "Review: a new forum moved after the last forum",
      "status": "done",
      "start": "2026-10-14T10:05",
      "end": "2026-10-14T10:06"
    },
    {
      "id": "7",
      "kind": "phase",
      "name": "OCR",
      "size": 3,
      "dependsOn": [
        "2"
      ],
      "scope": "Screenshot pipeline: /raid screenshot, @mention trigger, passive trigger",
      "doneWhen": "Fixture suite green; live screenshots create raids on staging via all three triggers"
    },
    {
      "id": "7R",
      "kind": "plan",
      "parent": "7",
      "name": "7R OCR research (with Matt's screenshots)",
      "status": "done",
      "size": 0.6,
      "dependsOn": [
        "6F"
      ],
      "scope": "A harness that scores each approach per element (gym, tier, phone clock, countdown, boss) on the 24 sample screenshots; Tesseract.js on the raw image against PaddleOCR (ONNX in Node, or Python in a container of its own); the tier counted from the tier heads by image matching, not OCR. Ends with a recommendation to Matt and the design of the plan(s) that build Phase 7."
    },
    {
      "id": "7R.1",
      "kind": "task",
      "parent": "7R",
      "name": "Samples labelled by hand; the legacy reader digested",
      "status": "done",
      "start": "2026-10-14T11:32",
      "end": "2026-10-14T11:35"
    },
    {
      "id": "7R.2",
      "kind": "task",
      "parent": "7R",
      "name": "Scoring harness; Tesseract.js on the raw image (gym 1/24)",
      "status": "done",
      "start": "2026-10-14T11:35",
      "end": "2026-10-14T11:44"
    },
    {
      "id": "7R.3",
      "kind": "task",
      "parent": "7R",
      "name": "PaddleOCR in Node (gutenye, PP-OCRv4); gyms through Pine's search",
      "status": "done",
      "start": "2026-10-14T11:44",
      "end": "2026-10-14T11:48"
    },
    {
      "id": "7R.4",
      "kind": "task",
      "parent": "7R",
      "name": "Tier heads by template matching; shadow by purple share",
      "status": "done",
      "start": "2026-10-14T11:50",
      "end": "2026-10-14T11:53"
    },
    {
      "id": "7R.5",
      "kind": "task",
      "parent": "7R",
      "name": "Phone clock: the status bar read again, enlarged",
      "status": "done",
      "start": "2026-10-14T11:48",
      "end": "2026-10-14T11:50"
    },
    {
      "id": "7R.7",
      "kind": "task",
      "parent": "7R",
      "name": "Four new samples (Dialga hiding its name, dawn); boss from CP and tier",
      "status": "done",
      "start": "2026-10-14T11:59",
      "end": "2026-10-14T12:04"
    },
    {
      "id": "7R.6",
      "kind": "task",
      "parent": "7R",
      "name": "Ways to run PaddleOCR (Node in process vs Python container, GPU); write-up",
      "status": "done",
      "start": "2026-10-14T12:04",
      "end": "2026-10-14T12:49"
    },
    {
      "id": "7A",
      "kind": "plan",
      "parent": "7",
      "name": "7A The screenshot reader (no Discord)",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "7R"
      ],
      "scope": "Settings and the model files; Pine's own layer around PaddleOCR PP-OCRv4 on onnxruntime-node; the raid screen's text, tier heads and shadow; a reading process of its own (queue, time limit, low priority); what a screenshot reports (gym, tier, boss from CP, time); npm run ocr:check.",
      "planning": {
        "start": "2026-10-14T12:55",
        "end": "2026-10-14T15:03",
        "review": {
          "start": "2026-10-14T14:02",
          "end": "2026-10-14T14:55"
        }
      },
      "review": {
        "start": "2026-10-14T16:18",
        "end": "2026-10-14T16:36"
      }
    },
    {
      "id": "7A.1",
      "kind": "task",
      "parent": "7A",
      "name": "Settings and the reader's files, downloaded and checked",
      "status": "done",
      "start": "2026-10-14T15:03",
      "end": "2026-10-14T16:10"
    },
    {
      "id": "7A.2",
      "kind": "task",
      "parent": "7A",
      "name": "What surrounds the models: boxes of text, decoding, lines",
      "status": "done",
      "start": "2026-10-14T16:10",
      "end": "2026-10-14T16:11"
    },
    {
      "id": "7A.3",
      "kind": "task",
      "parent": "7A",
      "name": "What the text of a raid screen says",
      "status": "done",
      "start": "2026-10-14T16:11",
      "end": "2026-10-14T16:12"
    },
    {
      "id": "7A.4",
      "kind": "task",
      "parent": "7A",
      "name": "Tier heads by template matching; the purple of shadow raids",
      "status": "done",
      "start": "2026-10-14T16:12",
      "end": "2026-10-14T16:12"
    },
    {
      "id": "7A.5",
      "kind": "task",
      "parent": "7A",
      "name": "The reading process: models through onnxruntime, a screen read whole",
      "status": "done",
      "start": "2026-10-14T16:12",
      "end": "2026-10-14T16:13"
    },
    {
      "id": "7A.6",
      "kind": "task",
      "parent": "7A",
      "name": "OcrService: one at a time in a process of its own",
      "status": "done",
      "start": "2026-10-14T16:13",
      "end": "2026-10-14T16:14"
    },
    {
      "id": "7A.7",
      "kind": "task",
      "parent": "7A",
      "name": "What a screenshot reports: gym, egg or hatched, tier, boss, time",
      "status": "done",
      "start": "2026-10-14T16:14",
      "end": "2026-10-14T16:14"
    },
    {
      "id": "7A.8",
      "kind": "task",
      "parent": "7A",
      "name": "npm run ocr:check",
      "status": "done",
      "start": "2026-10-14T16:14",
      "end": "2026-10-14T16:18"
    },
    {
      "id": "7B",
      "kind": "plan",
      "parent": "7",
      "name": "7B Screenshots on Discord",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "7A"
      ],
      "scope": "/read-screenshot with feedback; /raid with a screenshot and the @mention; a guessed time said in the post; the Screenshot feedback button; the review folder; raid egg pictures; ocr:review, the skill and the log for later sessions; passive reading if it costs nothing.",
      "planning": {
        "start": "2026-10-14T18:44",
        "end": "2026-10-14T22:19",
        "review": {
          "start": "2026-10-14T20:15",
          "end": "2026-10-14T22:12"
        }
      },
      "review": {
        "start": "2026-10-14T22:34",
        "end": "2026-10-14T23:05"
      }
    },
    {
      "id": "7B.1",
      "kind": "task",
      "parent": "7B",
      "name": "Screenshot reader wired into the bot: settings, context, start and shutdown",
      "status": "done",
      "start": "2026-10-14T22:19",
      "end": "2026-10-14T22:25"
    },
    {
      "id": "7B.2",
      "kind": "task",
      "parent": "7B",
      "name": "A screenshot's time from its file name; the purple on the name-alone path",
      "status": "done",
      "start": "2026-10-14T22:25",
      "end": "2026-10-14T22:27"
    },
    {
      "id": "7B.3",
      "kind": "task",
      "parent": "7B",
      "name": "Screenshots kept on disk: held for a day, copied for review, swept hourly",
      "status": "done",
      "start": "2026-10-14T22:27",
      "end": "2026-10-14T22:28"
    },
    {
      "id": "7B.4",
      "kind": "task",
      "parent": "7B",
      "name": "Reading a screenshot for Discord: the service, the rule of doubts, the words",
      "status": "done",
      "start": "2026-10-14T22:28",
      "end": "2026-10-14T22:28"
    },
    {
      "id": "7B.5",
      "kind": "task",
      "parent": "7B",
      "name": "read-screenshot and the feedback controls",
      "status": "done",
      "start": "2026-10-14T22:28",
      "end": "2026-10-14T22:29"
    },
    {
      "id": "7B.6",
      "kind": "task",
      "parent": "7B",
      "name": "A raid remembers its screenshot: state document version 8",
      "status": "done",
      "start": "2026-10-14T22:29",
      "end": "2026-10-14T22:30"
    },
    {
      "id": "7B.7",
      "kind": "task",
      "parent": "7B",
      "name": "raid with a screenshot",
      "status": "done",
      "start": "2026-10-14T22:30",
      "end": "2026-10-14T22:31"
    },
    {
      "id": "7B.8",
      "kind": "task",
      "parent": "7B",
      "name": "Screenshots posted with a mention of the bot, and passively",
      "status": "done",
      "start": "2026-10-14T22:31",
      "end": "2026-10-14T22:31"
    },
    {
      "id": "7B.9",
      "kind": "task",
      "parent": "7B",
      "name": "Screenshot feedback on the post of a raid reported from a screenshot",
      "status": "done",
      "start": "2026-10-14T22:31",
      "end": "2026-10-14T22:32"
    },
    {
      "id": "7B.10",
      "kind": "task",
      "parent": "7B",
      "name": "The game's egg on the post of an egg",
      "status": "done",
      "start": "2026-10-14T22:32",
      "end": "2026-10-14T22:33"
    },
    {
      "id": "7B.11",
      "kind": "task",
      "parent": "7B",
      "name": "Gyms that share a name: gym duplicates, and a warning when one is made",
      "status": "done",
      "start": "2026-10-14T22:33",
      "end": "2026-10-14T22:33"
    },
    {
      "id": "7B.12",
      "kind": "task",
      "parent": "7B",
      "name": "ocr:review, ocr:check over a review folder with a baseline, the improvement skill",
      "status": "done",
      "start": "2026-10-14T22:33",
      "end": "2026-10-14T22:34"
    },
    {
      "id": "7S",
      "kind": "plan",
      "parent": "7",
      "name": "7S Staging of 7B (with Matt)",
      "status": "done",
      "size": 0.3,
      "dependsOn": [
        "7B"
      ],
      "scope": "The staging checklist at the end of the 7B plan, with both accounts, passive reading included."
    },
    {
      "id": "7S.1",
      "kind": "task",
      "parent": "7S",
      "name": "read-screenshot, raid with a screenshot, feedback, guessed time",
      "status": "done",
      "start": "2026-10-14T23:26",
      "end": "2026-10-14T23:34"
    },
    {
      "id": "7S.2",
      "kind": "task",
      "parent": "7S",
      "name": "Mentions, gym questions, egg pictures, gym duplicates",
      "status": "done",
      "start": "2026-10-14T23:34",
      "end": "2026-10-14T23:48"
    },
    {
      "id": "7S.3",
      "kind": "task",
      "parent": "7S",
      "name": "Passive reading",
      "status": "done",
      "start": "2026-10-14T23:48",
      "end": "2026-10-14T23:54"
    },
    {
      "id": "7F",
      "kind": "plan",
      "parent": "7",
      "name": "7F Fixes after the staging of 7B",
      "status": "done",
      "size": 0.2,
      "dependsOn": [
        "7S"
      ],
      "scope": "The clock of a guessed time named, passive reading deleting and telling of raids that exist, a gym pick answered in its question; review fixes."
    },
    {
      "id": "7F.1",
      "kind": "task",
      "parent": "7F",
      "name": "Clock wording, passive deletion, answer in the question",
      "status": "done",
      "start": "2026-10-14T23:55",
      "end": "2026-10-15T00:03"
    },
    {
      "id": "7F.2",
      "kind": "task",
      "parent": "7F",
      "name": "Review fixes, the passive reply, tests",
      "status": "done",
      "start": "2026-10-15T00:03",
      "end": "2026-10-15T00:31"
    },
    {
      "id": "7P",
      "kind": "plan",
      "parent": "7",
      "name": "7P Split-screen screenshots",
      "status": "done",
      "size": 1,
      "scope": "Android's divider or the text cut a picture into two panes, each read and reported as a screenshot of its own; a picture of two screens that cannot be told apart is refused (design 2026-10-26-split-screen-screenshots-design.md). Not a priority (Matt).",
      "planning": {
        "start": "2026-10-26T16:15",
        "end": "2026-10-27T11:11",
        "review": {
          "start": "2026-10-27T05:45",
          "end": "2026-10-27T10:06"
        }
      },
      "review": {
        "start": "2026-10-27T12:25",
        "end": "2026-10-27T13:09"
      }
    },
    {
      "id": "7P.1",
      "kind": "task",
      "parent": "7P",
      "name": "Anchors, twoScreens, findPanes and the margin trim (pure)",
      "status": "done",
      "start": "2026-10-27T11:11",
      "end": "2026-10-27T12:15"
    },
    {
      "id": "7P.2",
      "kind": "task",
      "parent": "7P",
      "name": "The reading process: panes read and accepted, status lines handed down, reading width; ocr:check per pane",
      "status": "done",
      "start": "2026-10-27T12:15",
      "end": "2026-10-27T12:18"
    },
    {
      "id": "7P.3",
      "kind": "task",
      "parent": "7P",
      "name": "ScreenshotService.readPanes, one record and linked file per pane, the two-screens refusal",
      "status": "done",
      "start": "2026-10-27T12:18",
      "end": "2026-10-27T12:21"
    },
    {
      "id": "7P.4",
      "kind": "task",
      "parent": "7P",
      "name": "Mentions and passive reading per pane: the second use, the batch count, the questions",
      "status": "done",
      "start": "2026-10-27T12:21",
      "end": "2026-10-27T12:23"
    },
    {
      "id": "7P.5",
      "kind": "task",
      "parent": "7P",
      "name": "raid and max screenshot:, read-screenshot and feedback per pane",
      "status": "done",
      "start": "2026-10-27T12:23",
      "end": "2026-10-27T12:24"
    },
    {
      "id": "7P.6",
      "kind": "task",
      "parent": "7P",
      "name": "Docs, the guide line on what is kept, the measurement, the staging checklist",
      "status": "done",
      "start": "2026-10-27T12:24",
      "end": "2026-10-27T12:25"
    },
    {
      "id": "8",
      "kind": "phase",
      "name": "Posts and messages",
      "dependsOn": [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7"
      ],
      "scope": "Every message as components-v2: the posts' look, DMs, lists, help, gyms and regions; the Where section, the phone fixes, icon-only buttons",
      "doneWhen": "Every message is components-v2 and staged, on a phone too"
    },
    {
      "id": "8A",
      "kind": "plan",
      "parent": "8",
      "name": "8A The look of the posts and the command names",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "8P"
      ],
      "scope": "Posts in Discord's components v2 (status lines with their buttons, counts, the reporter at the bottom), application emoji for types, weather and teams, /interested with /hmm, /coming, the league commands, the trainer estimate in /counters",
      "planning": {
        "start": "2026-10-15T01:46",
        "end": "2026-10-15T05:12",
        "review": {
          "start": "2026-10-15T03:14",
          "end": "2026-10-15T04:49"
        }
      },
      "review": {
        "start": "2026-10-15T05:21",
        "end": "2026-10-15T09:40"
      }
    },
    {
      "id": "8A.1",
      "kind": "task",
      "parent": "8A",
      "name": "Components-v2 messages in the gateway and the fake gateway",
      "status": "done",
      "start": "2026-10-15T05:12",
      "end": "2026-10-15T05:14"
    },
    {
      "id": "8A.2",
      "kind": "task",
      "parent": "8A",
      "name": "Emoji of the bot's application first, and the script that uploads them",
      "status": "done",
      "start": "2026-10-15T05:14",
      "end": "2026-10-15T05:15"
    },
    {
      "id": "8A.3",
      "kind": "task",
      "parent": "8A",
      "name": "The parts of a v2 post: layout, trainer lists, buttons, raid words",
      "status": "done",
      "start": "2026-10-15T05:15",
      "end": "2026-10-15T05:16"
    },
    {
      "id": "8A.4",
      "kind": "task",
      "parent": "8A",
      "name": "Posts of raids, meetups and trains as components-v2 messages",
      "status": "done",
      "start": "2026-10-15T05:16",
      "end": "2026-10-15T05:18"
    },
    {
      "id": "8A.5",
      "kind": "task",
      "parent": "8A",
      "name": "A forum post starts as a line of text where Discord refuses v2 there",
      "status": "done",
      "start": "2026-10-15T05:18",
      "end": "2026-10-15T05:19"
    },
    {
      "id": "8A.6",
      "kind": "task",
      "parent": "8A",
      "name": "Second names of commands, /interested, and /rank in each league",
      "status": "done",
      "start": "2026-10-15T05:19",
      "end": "2026-10-15T05:20"
    },
    {
      "id": "8A.7",
      "kind": "task",
      "parent": "8A",
      "name": "CLAUDE.md: v2 posts, emoji of the application, forms of commands",
      "status": "done",
      "start": "2026-10-15T05:20",
      "end": "2026-10-15T05:21"
    },
    {
      "id": "8S",
      "kind": "plan",
      "parent": "8",
      "name": "8S Staging of 8A (with Matt)",
      "status": "done",
      "size": 0.3,
      "dependsOn": [
        "8A"
      ],
      "scope": "The 8A staging checklist with both accounts: every kind of post as components v2, the emoji, buttons, copies, moves, ends, command names, the DMs on the phone."
    },
    {
      "id": "8S.1",
      "kind": "task",
      "parent": "8S",
      "name": "Posts, buttons, copies, moves, ends, command names",
      "status": "done",
      "start": "2026-10-15T09:55",
      "end": "2026-10-15T10:14"
    },
    {
      "id": "8S.2",
      "kind": "task",
      "parent": "8S",
      "name": "Want DM and meeting-time DM on the phone (second account)",
      "status": "done",
      "start": "2026-10-15T10:14",
      "end": "2026-10-15T10:30"
    },
    {
      "id": "8F",
      "kind": "plan",
      "parent": "8",
      "name": "8F Fixes after the staging of 8A",
      "status": "done",
      "size": 0.1,
      "dependsOn": [
        "8S"
      ],
      "scope": "A closed egg shown as the egg, the small print without mentions, the meeting-time DM without markdown."
    },
    {
      "id": "8F.1",
      "kind": "task",
      "parent": "8F",
      "name": "Three fixes, review, check",
      "status": "done",
      "start": "2026-10-15T10:30",
      "end": "2026-10-15T10:45"
    },
    {
      "id": "8B-1",
      "kind": "plan",
      "parent": "8",
      "name": "8B-1 The new layout: DMs, lists, spawns, summary",
      "status": "done",
      "size": 0.6,
      "dependsOn": [
        "8F"
      ],
      "scope": "Components-v2 DMs (picture, Go to post, Map, each reason with its Stop), /wants and /targets with Remove beside each and pages, spawn reports, the region summary; the meeting-time DM stays plain text",
      "planning": {
        "start": "2026-10-15T11:00",
        "end": "2026-10-15T12:49",
        "review": {
          "start": "2026-10-15T12:05",
          "end": "2026-10-15T12:48"
        }
      },
      "review": {
        "start": "2026-10-15T13:08",
        "end": "2026-10-15T13:26"
      }
    },
    {
      "id": "8B-1.1",
      "kind": "task",
      "parent": "8B-1",
      "name": "DMs may be components-v2 messages: the sender, the gateway and the strict fake",
      "status": "done",
      "start": "2026-10-15T12:49",
      "end": "2026-10-15T13:02"
    },
    {
      "id": "8B-1.2",
      "kind": "task",
      "parent": "8B-1",
      "name": "Direct messages of the notifier as components-v2 messages",
      "status": "done",
      "start": "2026-10-15T13:02",
      "end": "2026-10-15T13:03"
    },
    {
      "id": "8B-1.3",
      "kind": "task",
      "parent": "8B-1",
      "name": "Lists of wants and gyms as components-v2 messages with pages and Remove",
      "status": "done",
      "start": "2026-10-15T13:03",
      "end": "2026-10-15T13:04"
    },
    {
      "id": "8B-1.4",
      "kind": "task",
      "parent": "8B-1",
      "name": "Spawn reports and Unown sightings as components-v2 messages",
      "status": "done",
      "start": "2026-10-15T13:04",
      "end": "2026-10-15T13:05"
    },
    {
      "id": "8B-1.5",
      "kind": "task",
      "parent": "8B-1",
      "name": "The region summary and region-channel status as components-v2 messages",
      "status": "done",
      "start": "2026-10-15T13:05",
      "end": "2026-10-15T13:07"
    },
    {
      "id": "8B-1.6",
      "kind": "task",
      "parent": "8B-1",
      "name": "CLAUDE.md conventions for plan 8B-1, and its staging checklist",
      "status": "done",
      "start": "2026-10-15T13:07",
      "end": "2026-10-15T13:08"
    },
    {
      "id": "8B-2",
      "kind": "plan",
      "parent": "8",
      "name": "8B-2 The new layout: counters, rank, help",
      "status": "done",
      "size": 0.5,
      "dependsOn": [
        "8B-1"
      ],
      "scope": "/counters with \"Change options…\" (a dialog) and Pokébox answers, /rank with league buttons and the evolution line, /help with menus of groups and commands",
      "planning": {
        "start": "2026-10-15T13:35",
        "end": "2026-10-15T15:15",
        "review": {
          "start": "2026-10-15T14:18",
          "end": "2026-10-15T15:13"
        }
      },
      "review": {
        "start": "2026-10-15T15:28",
        "end": "2026-10-15T15:48"
      }
    },
    {
      "id": "8B-2.1",
      "kind": "task",
      "parent": "8B-2",
      "name": "Controls of a public answer, a throttle per control, and forms checked in the fakes",
      "status": "done",
      "start": "2026-10-15T15:15",
      "end": "2026-10-15T15:19"
    },
    {
      "id": "8B-2.2",
      "kind": "task",
      "parent": "8B-2",
      "name": "The answer of rank and its short forms as a components-v2 message with buttons",
      "status": "done",
      "start": "2026-10-15T15:19",
      "end": "2026-10-15T15:20"
    },
    {
      "id": "8B-2.3",
      "kind": "task",
      "parent": "8B-2",
      "name": "Help as components-v2 pages with menus and buttons between them",
      "status": "done",
      "start": "2026-10-15T15:20",
      "end": "2026-10-15T15:20"
    },
    {
      "id": "8B-2.4",
      "kind": "task",
      "parent": "8B-2",
      "name": "The answer of counters as a components-v2 message",
      "status": "done",
      "start": "2026-10-15T15:20",
      "end": "2026-10-15T15:21"
    },
    {
      "id": "8B-2.5",
      "kind": "task",
      "parent": "8B-2",
      "name": "Change options of a counters answer: kept options, a dialog and its submit",
      "status": "done",
      "start": "2026-10-15T15:21",
      "end": "2026-10-15T15:22"
    },
    {
      "id": "8B-2.6",
      "kind": "task",
      "parent": "8B-2",
      "name": "CLAUDE.md conventions for plan 8B-2, and its staging checklist",
      "status": "done",
      "start": "2026-10-15T15:22",
      "end": "2026-10-15T15:27"
    },
    {
      "id": "8B-2.7",
      "kind": "task",
      "parent": "8B-2",
      "name": "A read-screenshot test fakes the time it is read at",
      "status": "done",
      "start": "2026-10-15T15:27",
      "end": "2026-10-15T15:28"
    },
    {
      "id": "8B-3",
      "kind": "plan",
      "parent": "8",
      "name": "8B-3 Train modes and the Move train panel",
      "status": "done",
      "size": 0.4,
      "dependsOn": [
        "8B-2"
      ],
      "scope": "A train loops, turns back or finishes at the end of its route (an option of /train, a menu in the panel, kept with a saved route), Reverse, the Move train panel as a components-v2 message",
      "planning": {
        "start": "2026-10-15T16:19",
        "end": "2026-10-15T17:44",
        "review": {
          "start": "2026-10-15T17:03",
          "end": "2026-10-15T17:31"
        }
      },
      "review": {
        "start": "2026-10-15T17:52",
        "end": "2026-10-15T18:07"
      }
    },
    {
      "id": "8B-3.1",
      "kind": "task",
      "parent": "8B-3",
      "name": "Train modes in the domain: finish, loop, turn back; Reverse; the mode",
      "status": "done",
      "start": "2026-10-15T17:44",
      "end": "2026-10-15T17:46"
    },
    {
      "id": "8B-3.2",
      "kind": "task",
      "parent": "8B-3",
      "name": "Train modes in the services; saved routes keep the mode (migration 013); /train at-end",
      "status": "done",
      "start": "2026-10-15T17:46",
      "end": "2026-10-15T17:50"
    },
    {
      "id": "8B-3.3",
      "kind": "task",
      "parent": "8B-3",
      "name": "The post of a train says its mode",
      "status": "done",
      "start": "2026-10-15T17:50",
      "end": "2026-10-15T17:51"
    },
    {
      "id": "8B-3.4",
      "kind": "task",
      "parent": "8B-3",
      "name": "The Move train panel as a components-v2 message, with Reverse and the mode menu",
      "status": "done",
      "start": "2026-10-15T17:51",
      "end": "2026-10-15T17:52"
    },
    {
      "id": "8B-3.5",
      "kind": "task",
      "parent": "8B-3",
      "name": "Help texts, CLAUDE.md conventions and the staging checklist",
      "status": "done",
      "start": "2026-10-15T17:52",
      "end": "2026-10-15T17:52"
    },
    {
      "id": "8B-4",
      "kind": "plan",
      "parent": "8",
      "name": "8B-4 The new layout: gyms, regions, screenshots, roles",
      "status": "done",
      "size": 0.4,
      "dependsOn": [
        "8B-3",
        "8W-1"
      ],
      "scope": "/gym show and every embed left (gym and region administration, the gym announcements, /find-gym, /find-region, /bounds), /read-screenshot, headings over the /iam menus; after 8W-1 is merged back (same gym files)",
      "planning": {
        "start": "2026-10-15T20:03",
        "end": "2026-10-15T22:41",
        "review": {
          "start": "2026-10-15T21:24",
          "end": "2026-10-15T22:21"
        }
      },
      "review": {
        "start": "2026-10-15T22:49",
        "end": "2026-10-15T23:23"
      }
    },
    {
      "id": "8B-4.1",
      "kind": "task",
      "parent": "8B-4",
      "name": "Map galleries, files on v2 messages, answers in place",
      "status": "done",
      "start": "2026-10-15T22:41",
      "end": "2026-10-15T22:44"
    },
    {
      "id": "8B-4.2",
      "kind": "task",
      "parent": "8B-4",
      "name": "Gym views, questions and the announcement as v2 messages",
      "status": "done",
      "start": "2026-10-15T22:44",
      "end": "2026-10-15T22:45"
    },
    {
      "id": "8B-4.3",
      "kind": "task",
      "parent": "8B-4",
      "name": "Edit, Make elite, Move and Delete on the view of /gym show",
      "status": "done",
      "start": "2026-10-15T22:45",
      "end": "2026-10-15T22:46"
    },
    {
      "id": "8B-4.4",
      "kind": "task",
      "parent": "8B-4",
      "name": "Regions and places as v2 messages",
      "status": "done",
      "start": "2026-10-15T22:46",
      "end": "2026-10-15T22:47"
    },
    {
      "id": "8B-4.5",
      "kind": "task",
      "parent": "8B-4",
      "name": "Read-screenshot and Screenshot feedback as v2 messages",
      "status": "done",
      "start": "2026-10-15T22:47",
      "end": "2026-10-15T22:48"
    },
    {
      "id": "8B-4.6",
      "kind": "task",
      "parent": "8B-4",
      "name": "The menus of /iam as one v2 container",
      "status": "done",
      "start": "2026-10-15T22:48",
      "end": "2026-10-15T22:49"
    },
    {
      "id": "8B-4.7",
      "kind": "task",
      "parent": "8B-4",
      "name": "Conventions, help and the staging checklist",
      "status": "done",
      "start": "2026-10-15T22:49",
      "end": "2026-10-15T22:49"
    },
    {
      "id": "8D",
      "kind": "plan",
      "parent": "8",
      "name": "8D Posts with a Where section, meetups with a place",
      "size": 1,
      "dependsOn": [
        "8W-2"
      ],
      "scope": "Raid, meetup and train posts lay out their place like /wild's Where (mockup approved 2026-10-17): heading block with the boss, Where with gym, address, Map, notice and Wayfarer picture; trains' next stops with a count and a Whole route button; meetups near a gym, PokéStop, power spot, free text or a pin; pins from maps links (also /wild near:); no elite mark for members",
      "doneWhen": "Merged into typescript-migration with its staging checklist",
      "planning": {
        "start": "2026-10-16T23:46",
        "end": "2026-10-17T03:08",
        "review": {
          "start": "2026-10-17T01:49",
          "end": "2026-10-17T03:00"
        }
      },
      "status": "done",
      "review": {
        "start": "2026-10-17T03:46",
        "end": "2026-10-17T03:46"
      }
    },
    {
      "id": "8D.1",
      "kind": "task",
      "parent": "8D",
      "name": "Raid post: the heading block and the Where section",
      "status": "done",
      "start": "2026-10-17T03:08",
      "end": "2026-10-17T03:11"
    },
    {
      "id": "8D.2",
      "kind": "task",
      "parent": "8D",
      "name": "The elite mark out of what members see",
      "status": "done",
      "start": "2026-10-17T03:11",
      "end": "2026-10-17T03:12"
    },
    {
      "id": "8D.3",
      "kind": "task",
      "parent": "8D",
      "name": "Train post: Where, the next stops and their count",
      "status": "done",
      "start": "2026-10-17T03:12",
      "end": "2026-10-17T03:14"
    },
    {
      "id": "8D.4",
      "kind": "task",
      "parent": "8D",
      "name": "Train post: the Whole route button",
      "status": "done",
      "start": "2026-10-17T03:14",
      "end": "2026-10-17T03:15"
    },
    {
      "id": "8D.5",
      "kind": "task",
      "parent": "8D",
      "name": "Pins from maps links and coordinates, also for /wild near:",
      "status": "done",
      "start": "2026-10-17T03:15",
      "end": "2026-10-17T03:18"
    },
    {
      "id": "8D.6",
      "kind": "task",
      "parent": "8D",
      "name": "The meetup's place in the model (state document 10)",
      "status": "done",
      "start": "2026-10-17T03:18",
      "end": "2026-10-17T03:20"
    },
    {
      "id": "8D.7",
      "kind": "task",
      "parent": "8D",
      "name": "Meetup post's Where, /meetup near: where:, /location for meetups",
      "status": "done",
      "start": "2026-10-17T03:20",
      "end": "2026-10-17T03:21"
    },
    {
      "id": "8D.8",
      "kind": "task",
      "parent": "8D",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-17T03:21",
      "end": "2026-10-17T03:21"
    },
    {
      "id": "8D-F",
      "kind": "plan",
      "parent": "8",
      "name": "8D-F Phone fixes from the staging of 8D",
      "size": 0.3,
      "dependsOn": [
        "8D"
      ],
      "scope": "Sign-up buttons beside one-line sections (names under the status line), a square egg picture (served by the bot, attached without web pages), the meeting-time hint on raids",
      "doneWhen": "Merged with its staging steps 35-41",
      "planning": {
        "start": "2026-10-17T08:37",
        "end": "2026-10-17T08:37"
      },
      "review": {
        "start": "2026-10-17T09:38",
        "end": "2026-10-17T10:09"
      },
      "status": "done"
    },
    {
      "id": "8D-F.1",
      "kind": "task",
      "parent": "8D-F",
      "name": "Sign-up buttons beside one-line sections",
      "status": "done",
      "start": "2026-10-17T08:37",
      "end": "2026-10-17T09:36"
    },
    {
      "id": "8D-F.2",
      "kind": "task",
      "parent": "8D-F",
      "name": "A square egg picture",
      "status": "done",
      "start": "2026-10-17T09:36",
      "end": "2026-10-17T09:37"
    },
    {
      "id": "8D-F.3",
      "kind": "task",
      "parent": "8D-F",
      "name": "Raid posts: how to set a meeting time while there is none",
      "status": "done",
      "start": "2026-10-17T09:37",
      "end": "2026-10-17T09:38"
    },
    {
      "id": "8D-G",
      "kind": "plan",
      "parent": "8",
      "name": "8D-G Icon-only status buttons, controls in one row",
      "size": 0.3,
      "dependsOn": [
        "8D"
      ],
      "scope": "Status buttons as icons only with legacy Pine reaction icons as application emoji (emoji:upload), plain fallback, the bottom controls in one row",
      "doneWhen": "Merged with its staging steps 42-46",
      "planning": {
        "start": "2026-10-17T12:53",
        "end": "2026-10-17T12:53"
      },
      "review": {
        "start": "2026-10-17T12:53",
        "end": "2026-10-17T12:54"
      },
      "status": "done"
    },
    {
      "id": "8D-G.1",
      "kind": "task",
      "parent": "8D-G",
      "name": "Emoji upload: legacy reaction icons",
      "status": "done",
      "start": "2026-10-17T12:53",
      "end": "2026-10-17T12:53"
    },
    {
      "id": "8D-G.2",
      "kind": "task",
      "parent": "8D-G",
      "name": "Status buttons as icons",
      "status": "done",
      "start": "2026-10-17T12:53",
      "end": "2026-10-17T12:53"
    },
    {
      "id": "8D-G.3",
      "kind": "task",
      "parent": "8D-G",
      "name": "The bottom controls in one row",
      "status": "done",
      "start": "2026-10-17T12:53",
      "end": "2026-10-17T12:53"
    },
    {
      "id": "8D-H",
      "kind": "plan",
      "parent": "8",
      "name": "8D-H A deleted button icon keeps the pictures",
      "size": 0.2,
      "dependsOn": [
        "8D-G"
      ],
      "scope": "Finding F4 of the phone staging: a refused button emoji tries plain emoji with the pictures kept before the bare form; refusedPart reads what Discord named; the application emoji read anew at once (at most once a minute)",
      "doneWhen": "Merged with staging step 46 rewritten",
      "planning": {
        "start": "2026-10-17T13:15",
        "end": "2026-10-17T14:37"
      },
      "status": "done",
      "review": {
        "start": "2026-10-17T14:37",
        "end": "2026-10-17T14:37"
      }
    },
    {
      "id": "8D-H.1",
      "kind": "task",
      "parent": "8D-H",
      "name": "Copies' refusal warning",
      "status": "done",
      "start": "2026-10-17T14:37",
      "end": "2026-10-17T14:37"
    },
    {
      "id": "8D-H.2",
      "kind": "task",
      "parent": "8D-H",
      "name": "Plain emoji with the pictures kept",
      "status": "done",
      "start": "2026-10-17T14:37",
      "end": "2026-10-17T14:37"
    },
    {
      "id": "8D-H.3",
      "kind": "task",
      "parent": "8D-H",
      "name": "Emoji re-read at once",
      "status": "done",
      "start": "2026-10-17T14:37",
      "end": "2026-10-17T14:37"
    },
    {
      "id": "8D-H.4",
      "kind": "task",
      "parent": "8D-H",
      "name": "Docs and staging step 46",
      "status": "done",
      "start": "2026-10-17T14:37",
      "end": "2026-10-17T14:37"
    },
    {
      "id": "8D-I",
      "kind": "plan",
      "parent": "8",
      "name": "8D-I The summary post taken over",
      "size": 0.1,
      "dependsOn": [
        "8D-H"
      ],
      "scope": "The Minor of the 2026-10-16 staging: a region whose summary record lost its post takes over the bot's \"Active raids\" post in the forum (the pinned one, else the oldest open one) instead of making a second, unpinnable one (30047)",
      "doneWhen": "Merged, reviewed, full check and database suite green",
      "status": "done",
      "review": {
        "start": "2026-10-20T12:45",
        "end": "2026-10-20T12:45"
      }
    },
    {
      "id": "8D-I.1",
      "kind": "task",
      "parent": "8D-I",
      "name": "Take over the summary post, with the review fixes",
      "status": "done",
      "start": "2026-10-20T12:45",
      "end": "2026-10-20T12:45"
    },
    {
      "id": "9",
      "kind": "phase",
      "name": "Wayfarer",
      "dependsOn": [
        "8"
      ],
      "scope": "The true list of gyms, stops and power spots from Wayfarer: the export (made by the Wayspot export tool), /gym import and review, Wayspots in posts, /wild near",
      "doneWhen": "A full scan of every region imported on production's copy, staged"
    },
    {
      "id": "8W-1",
      "kind": "plan",
      "parent": "9",
      "name": "8W-1 Wayfarer: the export, /gym import, /gym review",
      "status": "done",
      "size": 1,
      "dependsOn": [],
      "after": [
        "8F"
      ],
      "scope": "Spec 2026-10-15-wayfarer-wayspot-import-design.md: the export (the Wayspot export tool’s part kept with the tool), the export parser, gym matching by id, place and name with pogoId rewritten to the Wayfarer id, /gym import with preview and CSV report, the GymReview queue and /gym review, GymWayfarer",
      "doneWhen": "Pittsburgh's gyms imported from a full scan, every open question in the review queue",
      "planning": {
        "start": "2026-10-15T11:50",
        "end": "2026-10-15T18:18",
        "review": {
          "start": "2026-10-15T15:05",
          "end": "2026-10-15T17:47"
        }
      },
      "review": {
        "start": "2026-10-15T18:46",
        "end": "2026-10-15T19:13"
      }
    },
    {
      "id": "8W-1.1",
      "kind": "task",
      "parent": "8W-1",
      "name": "S2 cells and the export file",
      "status": "done",
      "start": "2026-10-15T18:18",
      "end": "2026-10-15T18:36"
    },
    {
      "id": "8W-1.2",
      "kind": "task",
      "parent": "8W-1",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-15T18:36",
      "end": "2026-10-15T18:37"
    },
    {
      "id": "8W-1.3",
      "kind": "task",
      "parent": "8W-1",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-15T18:37",
      "end": "2026-10-15T18:38"
    },
    {
      "id": "8W-1.4",
      "kind": "task",
      "parent": "8W-1",
      "name": "The tables GymWayfarer, GymReview, WayspotImport",
      "status": "done",
      "start": "2026-10-15T18:38",
      "end": "2026-10-15T18:41"
    },
    {
      "id": "8W-1.5",
      "kind": "task",
      "parent": "8W-1",
      "name": "Matching gyms to Wayspots, and the import's report",
      "status": "done",
      "start": "2026-10-15T18:41",
      "end": "2026-10-15T18:42"
    },
    {
      "id": "8W-1.6",
      "kind": "task",
      "parent": "8W-1",
      "name": "The Wayfarer import service, gym batches",
      "status": "done",
      "start": "2026-10-15T18:42",
      "end": "2026-10-15T18:43"
    },
    {
      "id": "8W-1.7",
      "kind": "task",
      "parent": "8W-1",
      "name": "Gym import from a Wayfarer export",
      "status": "done",
      "start": "2026-10-15T18:43",
      "end": "2026-10-15T18:45"
    },
    {
      "id": "8W-1.8",
      "kind": "task",
      "parent": "8W-1",
      "name": "The review queue of the gym import",
      "status": "done",
      "start": "2026-10-15T18:45",
      "end": "2026-10-15T18:46"
    },
    {
      "id": "8W-1.9",
      "kind": "task",
      "parent": "8W-1",
      "name": "CLAUDE.md conventions of the Wayfarer import",
      "status": "done",
      "start": "2026-10-15T18:46",
      "end": "2026-10-15T18:46"
    },
    {
      "id": "8W-1R",
      "kind": "plan",
      "parent": "9",
      "name": "8W-1R Wayfarer refinements after the first full scan",
      "status": "done",
      "size": 0.6,
      "dependsOn": [
        "8W-1"
      ],
      "after": [
        "8B-4"
      ],
      "scope": "Follow-ups \"From Phase 8W-1\": outlines in the export; Wayfarer addresses, tidy names, one bot-updates summary; Google lookups in a bounded daily line in the database (migration 014); the outline comparison and the bulk delete of gyms beyond a finished scan",
      "doneWhen": "Pittsburgh saved again with outlines, imported on staging, the Google line draining at its daily bound",
      "planning": {
        "start": "2026-10-15T21:32",
        "end": "2026-10-16T00:09",
        "review": {
          "start": "2026-10-15T22:57",
          "end": "2026-10-15T23:48"
        }
      },
      "review": {
        "start": "2026-10-16T00:35",
        "end": "2026-10-16T01:15"
      }
    },
    {
      "id": "8W-1R.1",
      "kind": "task",
      "parent": "8W-1R",
      "name": "The export carries the outlines of its areas",
      "status": "done",
      "start": "2026-10-16T00:09",
      "end": "2026-10-16T00:22"
    },
    {
      "id": "8W-1R.2",
      "kind": "task",
      "parent": "8W-1R",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-16T00:22",
      "end": "2026-10-16T00:23"
    },
    {
      "id": "8W-1R.3",
      "kind": "task",
      "parent": "8W-1R",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-16T00:23",
      "end": "2026-10-16T00:24"
    },
    {
      "id": "8W-1R.4",
      "kind": "task",
      "parent": "8W-1R",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-16T00:24",
      "end": "2026-10-16T00:25"
    },
    {
      "id": "8W-1R.5",
      "kind": "task",
      "parent": "8W-1R",
      "name": "A name changed only in spaces or capitals is tidied, not renamed",
      "status": "done",
      "start": "2026-10-16T00:25",
      "end": "2026-10-16T00:27"
    },
    {
      "id": "8W-1R.6",
      "kind": "task",
      "parent": "8W-1R",
      "name": "What an import and the review queue change, in one summary post",
      "status": "done",
      "start": "2026-10-16T00:27",
      "end": "2026-10-16T00:28"
    },
    {
      "id": "8W-1R.7",
      "kind": "task",
      "parent": "8W-1R",
      "name": "Imported gyms take Wayfarer's address; Google is asked for their places",
      "status": "done",
      "start": "2026-10-16T00:28",
      "end": "2026-10-16T00:30"
    },
    {
      "id": "8W-1R.8",
      "kind": "task",
      "parent": "8W-1R",
      "name": "The gyms that wait for Google in the database, a bounded number a day",
      "status": "done",
      "start": "2026-10-16T00:30",
      "end": "2026-10-16T00:31"
    },
    {
      "id": "8W-1R.9",
      "kind": "task",
      "parent": "8W-1R",
      "name": "The preview compares the scan's outlines with the regions, and lists the gyms beyond its area",
      "status": "done",
      "start": "2026-10-16T00:31",
      "end": "2026-10-16T00:33"
    },
    {
      "id": "8W-1R.10",
      "kind": "task",
      "parent": "8W-1R",
      "name": "After an import, delete the gyms beyond the area of a finished scan",
      "status": "done",
      "start": "2026-10-16T00:33",
      "end": "2026-10-16T00:33"
    },
    {
      "id": "8W-1R.11",
      "kind": "task",
      "parent": "8W-1R",
      "name": "Conventions, help and the staging checklist",
      "status": "done",
      "start": "2026-10-16T00:33",
      "end": "2026-10-16T00:35"
    },
    {
      "id": "8W-2",
      "kind": "plan",
      "parent": "9",
      "name": "8W-2 Wayfarer: stops and power spots, /wild near a Wayspot",
      "status": "done",
      "size": 0.5,
      "dependsOn": [
        "8W-1"
      ],
      "scope": "The Wayspot table filled by /gym import (stops and power spots, deletions where covered), /wild with an optional nearby stop, gym or power spot (details stay required)",
      "planning": {
        "start": "2026-10-16T04:48",
        "end": "2026-10-16T12:06",
        "review": {
          "start": "2026-10-16T06:00",
          "end": "2026-10-16T11:00"
        }
      },
      "doneWhen": "Pittsburgh imported on staging with its stops and power spots, pictures and addresses in posts, /wild near: finding the places members type",
      "review": {
        "start": "2026-10-16T12:17",
        "end": "2026-10-16T12:51"
      }
    },
    {
      "id": "8W-2.1",
      "kind": "task",
      "parent": "8W-2",
      "name": "The Wayspot table: every Wayspot an import keeps",
      "status": "done",
      "start": "2026-10-16T12:06",
      "end": "2026-10-16T12:09"
    },
    {
      "id": "8W-2.2",
      "kind": "task",
      "parent": "8W-2",
      "name": "The import keeps every Wayspot of the file",
      "status": "done",
      "start": "2026-10-16T12:09",
      "end": "2026-10-16T12:11"
    },
    {
      "id": "8W-2.3",
      "kind": "task",
      "parent": "8W-2",
      "name": "WayspotDirectory: the kept Wayspots in memory",
      "status": "done",
      "start": "2026-10-16T12:11",
      "end": "2026-10-16T12:12"
    },
    {
      "id": "8W-2.4",
      "kind": "task",
      "parent": "8W-2",
      "name": "The gym's Wayfarer picture beside its location in posts",
      "status": "done",
      "start": "2026-10-16T12:12",
      "end": "2026-10-16T12:14"
    },
    {
      "id": "8W-2.5",
      "kind": "task",
      "parent": "8W-2",
      "name": "Search over PokeStops and power spots, merged with the gyms",
      "status": "done",
      "start": "2026-10-16T12:14",
      "end": "2026-10-16T12:15"
    },
    {
      "id": "8W-2.6",
      "kind": "task",
      "parent": "8W-2",
      "name": "Wild near: the gym, PokeStop or power spot a Pokemon is near",
      "status": "done",
      "start": "2026-10-16T12:15",
      "end": "2026-10-16T12:16"
    },
    {
      "id": "8W-2.7",
      "kind": "task",
      "parent": "8W-2",
      "name": "Conventions of the kept Wayspots, the place search and wild near; staging",
      "status": "done",
      "start": "2026-10-16T12:16",
      "end": "2026-10-16T12:17"
    },
    {
      "id": "8W-3",
      "kind": "plan",
      "parent": "9",
      "name": "8W-3 Wayfarer: the small fixes",
      "status": "done",
      "size": 0.5,
      "dependsOn": [
        "8W-2",
        "8M-6"
      ],
      "scope": "The Minors 8W-1, 8W-1R and 8W-2 left open (import coverage, gym review, Google lookups, the export tool, gym search and wild), and the three 8M-6 left open",
      "doneWhen": "The fixes on the test server with a real export",
      "planning": {
        "start": "2026-10-17T18:07",
        "end": "2026-10-17T20:34",
        "review": {
          "start": "2026-10-17T19:21",
          "end": "2026-10-17T19:57"
        }
      },
      "review": {
        "start": "2026-10-17T20:42",
        "end": "2026-10-17T21:21"
      }
    },
    {
      "id": "8W-3.1",
      "kind": "task",
      "parent": "8W-3",
      "name": "Wayfarer small fixes: the import files and coverage",
      "status": "done",
      "start": "2026-10-17T20:34",
      "end": "2026-10-17T20:36"
    },
    {
      "id": "8W-3.2",
      "kind": "task",
      "parent": "8W-3",
      "name": "Wayfarer small fixes: gym review",
      "status": "done",
      "start": "2026-10-17T20:36",
      "end": "2026-10-17T20:37"
    },
    {
      "id": "8W-3.3",
      "kind": "task",
      "parent": "8W-3",
      "name": "Wayfarer small fixes: Google lookups",
      "status": "done",
      "start": "2026-10-17T20:37",
      "end": "2026-10-17T20:38"
    },
    {
      "id": "8W-3.4",
      "kind": "task",
      "parent": "8W-3",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-17T20:38",
      "end": "2026-10-17T20:39"
    },
    {
      "id": "8W-3.5",
      "kind": "task",
      "parent": "8W-3",
      "name": "Wayfarer small fixes: gym search, wild, text limits",
      "status": "done",
      "start": "2026-10-17T20:39",
      "end": "2026-10-17T20:40"
    },
    {
      "id": "8W-3.6",
      "kind": "task",
      "parent": "8W-3",
      "name": "Wayfarer small fixes: 8M-6 leftovers",
      "status": "done",
      "start": "2026-10-17T20:40",
      "end": "2026-10-17T20:42"
    },
    {
      "id": "8W-3.7",
      "kind": "task",
      "parent": "8W-3",
      "name": "Wayfarer small fixes: docs and staging checklist",
      "status": "done",
      "start": "2026-10-17T20:42",
      "end": "2026-10-17T20:42"
    },
    {
      "id": "8W-4",
      "kind": "plan",
      "parent": "9",
      "name": "8W-4 Wayfarer: export tool work (kept with the tool)",
      "status": "done",
      "size": 0.3,
      "dependsOn": [
        "8W-3"
      ],
      "scope": "Export tool work (kept with the tool)",
      "doneWhen": "Export tool work (kept with the tool)",
      "planning": {
        "start": "2026-10-17T21:22",
        "end": "2026-10-18T00:50",
        "review": {
          "start": "2026-10-18T00:36",
          "end": "2026-10-18T00:45"
        }
      },
      "review": {
        "start": "2026-10-18T00:54",
        "end": "2026-10-18T01:16"
      }
    },
    {
      "id": "8W-4.1",
      "kind": "task",
      "parent": "8W-4",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-18T00:50",
      "end": "2026-10-18T00:52"
    },
    {
      "id": "8W-4.2",
      "kind": "task",
      "parent": "8W-4",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-18T00:52",
      "end": "2026-10-18T00:52"
    },
    {
      "id": "8W-4.3",
      "kind": "task",
      "parent": "8W-4",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-18T00:52",
      "end": "2026-10-18T00:54"
    },
    {
      "id": "8W-5",
      "kind": "plan",
      "parent": "9",
      "name": "8W-5 Wayfarer: export tool work (kept with the tool)",
      "status": "done",
      "size": 0.4,
      "dependsOn": [
        "8W-4"
      ],
      "scope": "Export tool work (kept with the tool)",
      "doneWhen": "Export tool work (kept with the tool)",
      "planning": {
        "start": "2026-10-18T20:51",
        "end": "2026-10-18T22:29",
        "review": {
          "start": "2026-10-18T21:51",
          "end": "2026-10-18T22:24"
        }
      },
      "review": {
        "start": "2026-10-18T23:06",
        "end": "2026-10-18T23:50"
      }
    },
    {
      "id": "8W-5.1",
      "kind": "task",
      "parent": "8W-5",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-18T22:29",
      "end": "2026-10-18T23:02"
    },
    {
      "id": "8W-5.2",
      "kind": "task",
      "parent": "8W-5",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-18T23:02",
      "end": "2026-10-18T23:04"
    },
    {
      "id": "8W-5.3",
      "kind": "task",
      "parent": "8W-5",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-18T23:04",
      "end": "2026-10-18T23:05"
    },
    {
      "id": "8W-5.4",
      "kind": "task",
      "parent": "8W-5",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-18T23:05",
      "end": "2026-10-18T23:06"
    },
    {
      "id": "8W-5S",
      "kind": "plan",
      "parent": "9",
      "name": "8W-5S Wayfarer: export tool work (kept with the tool)",
      "status": "done",
      "size": 0.3,
      "dependsOn": [
        "8W-5"
      ],
      "scope": "Export tool work (kept with the tool)",
      "doneWhen": "Export tool work (kept with the tool)",
      "planning": {
        "start": "2026-10-19T13:42",
        "end": "2026-10-19T15:08",
        "review": {
          "start": "2026-10-19T14:30",
          "end": "2026-10-19T15:04"
        }
      },
      "review": {
        "start": "2026-10-19T15:13",
        "end": "2026-10-19T15:54"
      }
    },
    {
      "id": "8W-5S.1",
      "kind": "task",
      "parent": "8W-5S",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-19T15:08",
      "end": "2026-10-19T15:11"
    },
    {
      "id": "8W-5S.2",
      "kind": "task",
      "parent": "8W-5S",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-19T15:11",
      "end": "2026-10-19T15:12"
    },
    {
      "id": "8W-5S.3",
      "kind": "task",
      "parent": "8W-5S",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-19T15:12",
      "end": "2026-10-19T15:13"
    },
    {
      "id": "8W-5S.4",
      "kind": "task",
      "parent": "8W-5S",
      "name": "Export tool work (kept with the tool)",
      "status": "done",
      "start": "2026-10-19T15:13",
      "end": "2026-10-19T15:13"
    },
    {
      "id": "8W-P",
      "kind": "plan",
      "parent": "9",
      "name": "8W-P The Wayspot export tool private, handed out by the owner’s instance",
      "status": "done",
      "size": 0.6,
      "dependsOn": [
        "8W-5S"
      ],
      "scope": "The export tool and its code leave Pine for a private repository; Pine keeps the export format and the geometry as an internal package; the owner’s instance hands the tool out at /userscript to admins it approved, each with a key of their own",
      "doneWhen": "Pine’s files say nothing of how the tool works, the private repository builds and deploys the tool, and an approved admin installs and updates it from the owner’s instance",
      "planning": {
        "start": "2026-10-19T20:55",
        "end": "2026-10-20T00:47",
        "review": {
          "start": "2026-10-19T23:16",
          "end": "2026-10-20T00:44"
        }
      },
      "review": {
        "start": "2026-10-20T12:52",
        "end": "2026-10-20T13:58"
      }
    },
    {
      "id": "8W-P.1",
      "kind": "task",
      "parent": "8W-P",
      "name": "Private tool: Pine’s internal package of the export format and geometry",
      "status": "done",
      "start": "2026-10-20T00:47",
      "end": "2026-10-20T12:36"
    },
    {
      "id": "8W-P.2",
      "kind": "task",
      "parent": "8W-P",
      "name": "Private tool: the export and report contracts",
      "status": "done",
      "start": "2026-10-20T12:36",
      "end": "2026-10-20T12:37"
    },
    {
      "id": "8W-P.3",
      "kind": "task",
      "parent": "8W-P",
      "name": "Private tool: the new private repository",
      "status": "done",
      "start": "2026-10-20T12:37",
      "end": "2026-10-20T12:40"
    },
    {
      "id": "8W-P.4",
      "kind": "task",
      "parent": "8W-P",
      "name": "Private tool: the deploy command",
      "status": "done",
      "start": "2026-10-20T12:40",
      "end": "2026-10-20T12:43"
    },
    {
      "id": "8W-P.5",
      "kind": "task",
      "parent": "8W-P",
      "name": "Private tool: the cut out of Pine, the wayspotTool setting",
      "status": "done",
      "start": "2026-10-20T12:43",
      "end": "2026-10-20T12:43"
    },
    {
      "id": "8W-P.6",
      "kind": "task",
      "parent": "8W-P",
      "name": "Private tool: the access table",
      "status": "done",
      "start": "2026-10-20T12:43",
      "end": "2026-10-20T12:45"
    },
    {
      "id": "8W-P.7",
      "kind": "task",
      "parent": "8W-P",
      "name": "Private tool: the tool file and its addresses",
      "status": "done",
      "start": "2026-10-20T12:45",
      "end": "2026-10-20T12:48"
    },
    {
      "id": "8W-P.8",
      "kind": "task",
      "parent": "8W-P",
      "name": "Private tool: the page /userscript",
      "status": "done",
      "start": "2026-10-20T12:48",
      "end": "2026-10-20T12:49"
    },
    {
      "id": "8W-P.9",
      "kind": "task",
      "parent": "8W-P",
      "name": "Private tool: the owner’s DM",
      "status": "done",
      "start": "2026-10-20T12:49",
      "end": "2026-10-20T12:51"
    },
    {
      "id": "8W-P.10",
      "kind": "task",
      "parent": "8W-P",
      "name": "Private tool: docs, cutover history step, staging checklist",
      "status": "done",
      "start": "2026-10-20T12:51",
      "end": "2026-10-20T12:52"
    },
    {
      "id": "8W-6",
      "kind": "plan",
      "parent": "9",
      "name": "8W-6 The Google line as a priority queue with a monthly budget, imports in blocks",
      "status": "done",
      "size": 0.8,
      "dependsOn": [
        "8W-P"
      ],
      "scope": "Gyms, then PokéStops, then Power Spots in one Google line ranked by region activity; googleLookupsPerMonth with a reserve, Pacific months; Wayspots’ Google places as search names; /gym google; a first import’s gyms in blocks of 250 (migration 031)",
      "doneWhen": "Merged into typescript-migration before the cutover (about 2026-11-11)",
      "planning": {
        "start": "2026-10-25T21:40",
        "end": "2026-10-26T01:40",
        "review": {
          "start": "2026-10-25T23:15",
          "end": "2026-10-26T01:16"
        }
      },
      "review": {
        "start": "2026-10-26T01:50",
        "end": "2026-10-26T02:57"
      }
    },
    {
      "id": "8W-6.1",
      "kind": "task",
      "parent": "8W-6",
      "name": "Google line: the arithmetic in the domain",
      "status": "done",
      "start": "2026-10-26T01:40",
      "end": "2026-10-26T01:43"
    },
    {
      "id": "8W-6.2",
      "kind": "task",
      "parent": "8W-6",
      "name": "Google line: storage, the monthly budget, region ranks",
      "status": "done",
      "start": "2026-10-26T01:43",
      "end": "2026-10-26T01:46"
    },
    {
      "id": "8W-6.3",
      "kind": "task",
      "parent": "8W-6",
      "name": "Google line: PokéStops and Power Spots, their places in the search",
      "status": "done",
      "start": "2026-10-26T01:46",
      "end": "2026-10-26T01:47"
    },
    {
      "id": "8W-6.4",
      "kind": "task",
      "parent": "8W-6",
      "name": "Google line: a first import's gyms in blocks",
      "status": "done",
      "start": "2026-10-26T01:47",
      "end": "2026-10-26T01:48"
    },
    {
      "id": "8W-6.5",
      "kind": "task",
      "parent": "8W-6",
      "name": "Google line: gym google, how far the line is",
      "status": "done",
      "start": "2026-10-26T01:48",
      "end": "2026-10-26T01:49"
    },
    {
      "id": "8W-6.6",
      "kind": "task",
      "parent": "8W-6",
      "name": "Google line: the staging checklist",
      "status": "done",
      "start": "2026-10-26T01:49",
      "end": "2026-10-26T01:50"
    },
    {
      "id": "10",
      "kind": "phase",
      "name": "Container packaging",
      "size": 1,
      "dependsOn": [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7"
      ],
      "scope": "Dockerfile and compose stack: a new install comes up with one docker compose up",
      "doneWhen": "A new install comes up with one docker compose up; the image can also run against an existing external database"
    },
    {
      "id": "9A",
      "kind": "plan",
      "parent": "10",
      "name": "9A The Docker stack: image, compose, health, watchdog, restore, backups",
      "size": 1,
      "dependsOn": [
        "8L-1"
      ],
      "scope": "Image, compose (mysql, pine, watchdog, the cloudflared slot), heartbeat and owner DMs, restore of a legacy dump, verified nightly backups, the ./pine script",
      "planning": {
        "start": "2026-10-16T01:05",
        "end": "2026-10-16T03:53",
        "review": {
          "start": "2026-10-16T02:15",
          "end": "2026-10-16T03:31"
        }
      },
      "review": {
        "start": "2026-10-16T04:02",
        "end": "2026-10-16T05:34"
      },
      "status": "done"
    },
    {
      "id": "9A.1",
      "kind": "task",
      "parent": "9A",
      "name": "The image on node:24-slim",
      "status": "done",
      "start": "2026-10-16T03:53",
      "end": "2026-10-16T03:54"
    },
    {
      "id": "9A.2",
      "kind": "task",
      "parent": "9A",
      "name": "The Compose stack and ./pine",
      "status": "done",
      "start": "2026-10-16T03:54",
      "end": "2026-10-16T03:56"
    },
    {
      "id": "9A.3",
      "kind": "task",
      "parent": "9A",
      "name": "Heartbeat, health check, owner alerts, start and stop",
      "status": "done",
      "start": "2026-10-16T03:56",
      "end": "2026-10-16T03:56"
    },
    {
      "id": "9A.4",
      "kind": "task",
      "parent": "9A",
      "name": "The watchdog",
      "status": "done",
      "start": "2026-10-16T03:56",
      "end": "2026-10-16T03:57"
    },
    {
      "id": "9A.5",
      "kind": "task",
      "parent": "9A",
      "name": "Restore of a dump, lower-case tables renamed",
      "status": "done",
      "start": "2026-10-16T03:57",
      "end": "2026-10-16T03:59"
    },
    {
      "id": "9A.6",
      "kind": "task",
      "parent": "9A",
      "name": "Verified nightly backups",
      "status": "done",
      "start": "2026-10-16T03:59",
      "end": "2026-10-16T04:01"
    },
    {
      "id": "9A.7",
      "kind": "task",
      "parent": "9A",
      "name": "deploy-commands, update, shell",
      "status": "done",
      "start": "2026-10-16T04:01",
      "end": "2026-10-16T04:01"
    },
    {
      "id": "9A.8",
      "kind": "task",
      "parent": "9A",
      "name": "operations.md, Run with Docker, CI",
      "status": "done",
      "start": "2026-10-16T04:01",
      "end": "2026-10-16T04:02"
    },
    {
      "id": "11",
      "kind": "phase",
      "name": "Web map",
      "dependsOn": [
        "9"
      ],
      "scope": "The web server in the bot, Discord login, the public map, the region editor, parties on the map and made from it",
      "doneWhen": "The map and the editor staged on a desktop and a phone"
    },
    {
      "id": "8M-1",
      "kind": "plan",
      "parent": "11",
      "name": "8M-1 Web: server, Discord login, public map of regions and gyms",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "8W-1"
      ],
      "scope": "Spec 2026-10-15-web-map-region-editor-design.md: settings.web, the HTTP server in the bot, WebSession, OAuth (identify) and login links from /maps, the public map of regions and gyms (Leaflet, OSM or Google tiles), /maps pointing at it",
      "planning": {
        "start": "2026-10-16T01:40",
        "end": "2026-10-16T03:57",
        "review": {
          "start": "2026-10-16T02:58",
          "end": "2026-10-16T03:47"
        }
      },
      "doneWhen": "The map of the test server opened through a Discord login and a /maps link, regions and gyms shown, behind a tunnel",
      "review": {
        "start": "2026-10-16T04:07",
        "end": "2026-10-16T04:32"
      }
    },
    {
      "id": "8M-1.1",
      "kind": "task",
      "parent": "8M-1",
      "name": "settings.web and the secrets of the web pages",
      "status": "done",
      "start": "2026-10-16T03:57",
      "end": "2026-10-16T04:00"
    },
    {
      "id": "8M-1.2",
      "kind": "task",
      "parent": "8M-1",
      "name": "The web server in the bot",
      "status": "done",
      "start": "2026-10-16T04:00",
      "end": "2026-10-16T04:01"
    },
    {
      "id": "8M-1.3",
      "kind": "task",
      "parent": "8M-1",
      "name": "Sessions of the web pages, CSRF and logging out",
      "status": "done",
      "start": "2026-10-16T04:01",
      "end": "2026-10-16T04:03"
    },
    {
      "id": "8M-1.4",
      "kind": "task",
      "parent": "8M-1",
      "name": "Log in with Discord or a link of the bot",
      "status": "done",
      "start": "2026-10-16T04:03",
      "end": "2026-10-16T04:04"
    },
    {
      "id": "8M-1.5",
      "kind": "task",
      "parent": "8M-1",
      "name": "The regions and gyms of a server, for the map",
      "status": "done",
      "start": "2026-10-16T04:04",
      "end": "2026-10-16T04:05"
    },
    {
      "id": "8M-1.6",
      "kind": "task",
      "parent": "8M-1",
      "name": "The map page",
      "status": "done",
      "start": "2026-10-16T04:05",
      "end": "2026-10-16T04:06"
    },
    {
      "id": "8M-1.7",
      "kind": "task",
      "parent": "8M-1",
      "name": "The maps command gives the server's map with a login link",
      "status": "done",
      "start": "2026-10-16T04:06",
      "end": "2026-10-16T04:06"
    },
    {
      "id": "8M-1.8",
      "kind": "task",
      "parent": "8M-1",
      "name": "Conventions of the web server, setup guide, staging checklist",
      "status": "done",
      "start": "2026-10-16T04:06",
      "end": "2026-10-16T04:07"
    },
    {
      "id": "8M-2",
      "kind": "plan",
      "parent": "11",
      "name": "8M-2 Web: region editor",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "8M-1",
        "8W-2"
      ],
      "scope": "Spec 2026-10-15-web-map-region-editor-design.md: draw, reshape, split, snap, stage, preview and save through RegionAdminService, two editors at once, KML export; /region edit; the Wayspots of the latest import as layers, those outside every region marked; overlaps and gaps checked",
      "planning": {
        "start": "2026-10-16T13:07",
        "end": "2026-10-16T18:52",
        "review": {
          "start": "2026-10-16T14:57",
          "end": "2026-10-16T16:15"
        }
      },
      "doneWhen": "Regions drawn, reshaped, split and saved in the editor on the test server, two editors at once, KML round trip",
      "review": {
        "start": "2026-10-16T18:59",
        "end": "2026-10-16T19:47"
      }
    },
    {
      "id": "8M-2.1",
      "kind": "task",
      "parent": "8M-2",
      "name": "Region editor: versions, overlaps and gaps, staged edits",
      "status": "done",
      "start": "2026-10-16T18:52",
      "end": "2026-10-16T18:54"
    },
    {
      "id": "8M-2.2",
      "kind": "task",
      "parent": "8M-2",
      "name": "Region editor: who is staff on the web, the editor's data",
      "status": "done",
      "start": "2026-10-16T18:54",
      "end": "2026-10-16T18:55"
    },
    {
      "id": "8M-2.3",
      "kind": "task",
      "parent": "8M-2",
      "name": "Region editor: preview and save",
      "status": "done",
      "start": "2026-10-16T18:55",
      "end": "2026-10-16T18:56"
    },
    {
      "id": "8M-2.4",
      "kind": "task",
      "parent": "8M-2",
      "name": "Region editor: the page",
      "status": "done",
      "start": "2026-10-16T18:56",
      "end": "2026-10-16T18:57"
    },
    {
      "id": "8M-2.5",
      "kind": "task",
      "parent": "8M-2",
      "name": "Region edit: the editor's address with a login link",
      "status": "done",
      "start": "2026-10-16T18:57",
      "end": "2026-10-16T18:57"
    },
    {
      "id": "8M-2.6",
      "kind": "task",
      "parent": "8M-2",
      "name": "Region editor: docs and staging checklist",
      "status": "done",
      "start": "2026-10-16T18:57",
      "end": "2026-10-16T18:59"
    },
    {
      "id": "8M-2F",
      "kind": "plan",
      "parent": "11",
      "name": "8M-2F Web: Fix slivers in the region editor",
      "status": "done",
      "size": 0.5,
      "dependsOn": [
        "8M-2"
      ],
      "scope": "Spec 4.3 \"How Fix works\": stretches of two borders within 150 m become one shared line (one region's border or the midline), three-region corners, \"Fix all slivers\" asking about stretches with gyms or Wayspots, the worst-first list on first open; computed in the page as staged edits",
      "doneWhen": "Pittsburgh's real overlaps and gaps fixed in the editor on staging and saved",
      "planning": {
        "start": "2026-10-16T20:04",
        "end": "2026-10-16T22:12",
        "review": {
          "start": "2026-10-16T20:52",
          "end": "2026-10-16T22:07"
        }
      },
      "review": {
        "start": "2026-10-16T22:16",
        "end": "2026-10-16T22:51"
      }
    },
    {
      "id": "8M-2F.1",
      "kind": "task",
      "parent": "8M-2F",
      "name": "Region editor: the stretches of slivers that Fix takes",
      "status": "done",
      "start": "2026-10-16T22:12",
      "end": "2026-10-16T22:14"
    },
    {
      "id": "8M-2F.2",
      "kind": "task",
      "parent": "8M-2F",
      "name": "Region editor: one Fix rebuilds the outlines along a shared line",
      "status": "done",
      "start": "2026-10-16T22:14",
      "end": "2026-10-16T22:14"
    },
    {
      "id": "8M-2F.3",
      "kind": "task",
      "parent": "8M-2F",
      "name": "Region editor: Fix all slivers and the worst-first list",
      "status": "done",
      "start": "2026-10-16T22:14",
      "end": "2026-10-16T22:15"
    },
    {
      "id": "8M-2F.4",
      "kind": "task",
      "parent": "8M-2F",
      "name": "Region editor: Fix and Fix all slivers on the page",
      "status": "done",
      "start": "2026-10-16T22:15",
      "end": "2026-10-16T22:16"
    },
    {
      "id": "8M-2F.5",
      "kind": "task",
      "parent": "8M-2F",
      "name": "Region editor: Fix in the docs, and its staging checklist",
      "status": "done",
      "start": "2026-10-16T22:16",
      "end": "2026-10-16T22:16"
    },
    {
      "id": "8M-3",
      "kind": "plan",
      "parent": "11",
      "name": "8M-3 Web: parties on the map, joining",
      "status": "done",
      "size": 0.5,
      "dependsOn": [
        "8M-1"
      ],
      "scope": "Spec 2026-10-15-web-map-region-editor-design.md: the parties of the forums a logged-in member can see, without names; Interested, Join, Here, Leave, Done through AttendanceService",
      "planning": {
        "start": "2026-10-16T22:59",
        "end": "2026-10-17T00:17",
        "review": {
          "start": "2026-10-16T23:36",
          "end": "2026-10-17T00:06"
        }
      },
      "doneWhen": "Two accounts on the test server: parties on the map, a raid joined from the map shows on the post, an unseen forum opened and closed again, a barred member sees nothing of it",
      "review": {
        "start": "2026-10-17T00:23",
        "end": "2026-10-17T01:07"
      }
    },
    {
      "id": "8M-3.1",
      "kind": "task",
      "parent": "8M-3",
      "name": "Live map: the party view, what a member sees of a server's parties",
      "status": "done",
      "start": "2026-10-17T00:17",
      "end": "2026-10-17T00:18"
    },
    {
      "id": "8M-3.2",
      "kind": "task",
      "parent": "8M-3",
      "name": "Live map: who sees which parties, and the read-only state",
      "status": "done",
      "start": "2026-10-17T00:18",
      "end": "2026-10-17T00:19"
    },
    {
      "id": "8M-3.3",
      "kind": "task",
      "parent": "8M-3",
      "name": "Live map: the parties of a server, GET /s/<guild>/api/parties",
      "status": "done",
      "start": "2026-10-17T00:19",
      "end": "2026-10-17T00:20"
    },
    {
      "id": "8M-3.4",
      "kind": "task",
      "parent": "8M-3",
      "name": "Live map: joining a party, POST /s/<guild>/api/parties/<id>/<action>",
      "status": "done",
      "start": "2026-10-17T00:20",
      "end": "2026-10-17T00:21"
    },
    {
      "id": "8M-3.5",
      "kind": "task",
      "parent": "8M-3",
      "name": "Live map: the parties on the page, with their buttons",
      "status": "done",
      "start": "2026-10-17T00:21",
      "end": "2026-10-17T00:22"
    },
    {
      "id": "8M-3.6",
      "kind": "task",
      "parent": "8M-3",
      "name": "Live map: the parties' docs and the staging checklist",
      "status": "done",
      "start": "2026-10-17T00:22",
      "end": "2026-10-17T00:23"
    },
    {
      "id": "8M-4",
      "kind": "plan",
      "parent": "11",
      "name": "8M-4 Web: raids and spawns from the map",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "8M-3"
      ],
      "scope": "Spec 2026-10-15-web-map-region-editor-design.md 3.5, 3.6, 3.8: report a raid at a gym, change hatch, end, boss and moves, report a spawn at a point (SpawnReport.point)",
      "planning": {
        "start": "2026-10-17T01:38",
        "end": "2026-10-17T03:17",
        "review": {
          "start": "2026-10-17T02:19",
          "end": "2026-10-17T03:08"
        }
      },
      "doneWhen": "A raid reported and changed from the map on the test server shows on its post, with the command words, throttle and privacy of /raid",
      "review": {
        "start": "2026-10-17T03:25",
        "end": "2026-10-17T03:51"
      }
    },
    {
      "id": "8M-4.1",
      "kind": "task",
      "parent": "8M-4",
      "name": "Raids: one code path for reporting and changing, shared with the map",
      "status": "done",
      "start": "2026-10-17T03:17",
      "end": "2026-10-17T03:19"
    },
    {
      "id": "8M-4.2",
      "kind": "task",
      "parent": "8M-4",
      "name": "Map: the pick lists of a raid report",
      "status": "done",
      "start": "2026-10-17T03:19",
      "end": "2026-10-17T03:20"
    },
    {
      "id": "8M-4.3",
      "kind": "task",
      "parent": "8M-4",
      "name": "Map: report a raid",
      "status": "done",
      "start": "2026-10-17T03:20",
      "end": "2026-10-17T03:21"
    },
    {
      "id": "8M-4.4",
      "kind": "task",
      "parent": "8M-4",
      "name": "Map: change a raid",
      "status": "done",
      "start": "2026-10-17T03:21",
      "end": "2026-10-17T03:23"
    },
    {
      "id": "8M-4.5",
      "kind": "task",
      "parent": "8M-4",
      "name": "Map page: report and change raids",
      "status": "done",
      "start": "2026-10-17T03:23",
      "end": "2026-10-17T03:24"
    },
    {
      "id": "8M-4.6",
      "kind": "task",
      "parent": "8M-4",
      "name": "Docs: raids on the map, and the staging checklist of 8M-4",
      "status": "done",
      "start": "2026-10-17T03:24",
      "end": "2026-10-17T03:25"
    },
    {
      "id": "8M-4S",
      "kind": "plan",
      "parent": "11",
      "name": "8M-4S Web: spawns from the map",
      "status": "done",
      "size": 0.5,
      "dependsOn": [
        "8M-4",
        "8D"
      ],
      "scope": "Spec 3.8 with 8D's pins: Report spawn on a point of the map (long press, right click, or a place's popup), the Pokémon and details as /wild, the region the point lies in, through /wild's own code path and throttle",
      "doneWhen": "A spawn reported from the map on the test server shows in the region channel and the DMs with its pin",
      "planning": {
        "start": "2026-10-17T04:10",
        "end": "2026-10-17T05:17",
        "review": {
          "start": "2026-10-17T04:33",
          "end": "2026-10-17T05:08"
        }
      },
      "review": {
        "start": "2026-10-17T05:22",
        "end": "2026-10-17T05:39"
      }
    },
    {
      "id": "8M-4S.1",
      "kind": "task",
      "parent": "8M-4S",
      "name": "Spawn reports: one code path for /wild and the map",
      "status": "done",
      "start": "2026-10-17T05:17",
      "end": "2026-10-17T05:19"
    },
    {
      "id": "8M-4S.2",
      "kind": "task",
      "parent": "8M-4S",
      "name": "Map spawns: the pick list and the report route",
      "status": "done",
      "start": "2026-10-17T05:19",
      "end": "2026-10-17T05:20"
    },
    {
      "id": "8M-4S.3",
      "kind": "task",
      "parent": "8M-4S",
      "name": "Map spawns: the form on a long press, and in a gym's popup",
      "status": "done",
      "start": "2026-10-17T05:20",
      "end": "2026-10-17T05:21"
    },
    {
      "id": "8M-4S.4",
      "kind": "task",
      "parent": "8M-4S",
      "name": "Docs: spawns on the map, and the staging checklist of 8M-4S",
      "status": "done",
      "start": "2026-10-17T05:21",
      "end": "2026-10-17T05:22"
    },
    {
      "id": "8M-5",
      "kind": "plan",
      "parent": "11",
      "name": "8M-5 Web: trains and meetups from the map",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "8M-3"
      ],
      "scope": "Spec 2026-10-15-web-map-region-editor-design.md 3.7: start a train, build its route by clicking gyms, saved routes, Next, Previous, Skip, Finish, conductor; new meetups and their edits",
      "planning": {
        "start": "2026-10-17T05:44",
        "end": "2026-10-17T07:33",
        "review": {
          "start": "2026-10-17T06:41",
          "end": "2026-10-17T07:26"
        }
      },
      "doneWhen": "A train started, routed and moved from the map on the test server, its post and movement messages as from Discord",
      "review": {
        "start": "2026-10-17T07:39",
        "end": "2026-10-17T08:14"
      }
    },
    {
      "id": "8M-5.1",
      "kind": "task",
      "parent": "8M-5",
      "name": "Trains from the map: the commands' code paths shared",
      "status": "done",
      "start": "2026-10-17T07:33",
      "end": "2026-10-17T07:35"
    },
    {
      "id": "8M-5.2",
      "kind": "task",
      "parent": "8M-5",
      "name": "Trains from the map: starting a train",
      "status": "done",
      "start": "2026-10-17T07:35",
      "end": "2026-10-17T07:36"
    },
    {
      "id": "8M-5.3",
      "kind": "task",
      "parent": "8M-5",
      "name": "Trains from the map: the route",
      "status": "done",
      "start": "2026-10-17T07:36",
      "end": "2026-10-17T07:37"
    },
    {
      "id": "8M-5.4",
      "kind": "task",
      "parent": "8M-5",
      "name": "Trains from the map: moving, the conductor",
      "status": "done",
      "start": "2026-10-17T07:37",
      "end": "2026-10-17T07:38"
    },
    {
      "id": "8M-5.5",
      "kind": "task",
      "parent": "8M-5",
      "name": "Trains from the map: the page",
      "status": "done",
      "start": "2026-10-17T07:38",
      "end": "2026-10-17T07:38"
    },
    {
      "id": "8M-5.6",
      "kind": "task",
      "parent": "8M-5",
      "name": "Trains from the map: docs and staging checklist",
      "status": "done",
      "start": "2026-10-17T07:38",
      "end": "2026-10-17T07:39"
    },
    {
      "id": "8M-5M",
      "kind": "plan",
      "parent": "11",
      "name": "8M-5M Web: meetups from the map",
      "status": "done",
      "size": 0.6,
      "dependsOn": [
        "8M-5",
        "8S-1"
      ],
      "scope": "Spec 2026-10-15-web-map-region-editor-design.md 3.7 (last bullet): a new meetup made on the map through MeetupSafety.make (place a gym or a pin), its name, information and times changed there; meetups drawn at their place",
      "doneWhen": "A meetup made and changed from the map on the test server, one held for the moderators, as from /meetup",
      "planning": {
        "start": "2026-10-17T11:15",
        "end": "2026-10-17T13:21",
        "review": {
          "start": "2026-10-17T12:20",
          "end": "2026-10-17T13:03"
        }
      },
      "review": {
        "start": "2026-10-17T13:36",
        "end": "2026-10-17T14:02"
      }
    },
    {
      "id": "8M-5M.1",
      "kind": "task",
      "parent": "8M-5M",
      "name": "Meetups from the map: shared code paths, the source on the ask",
      "status": "done",
      "start": "2026-10-17T13:21",
      "end": "2026-10-17T13:26"
    },
    {
      "id": "8M-5M.2",
      "kind": "task",
      "parent": "8M-5M",
      "name": "Meetups from the map: making a meetup",
      "status": "done",
      "start": "2026-10-17T13:26",
      "end": "2026-10-17T13:28"
    },
    {
      "id": "8M-5M.3",
      "kind": "task",
      "parent": "8M-5M",
      "name": "Meetups from the map: changing a meetup",
      "status": "done",
      "start": "2026-10-17T13:28",
      "end": "2026-10-17T13:29"
    },
    {
      "id": "8M-5M.4",
      "kind": "task",
      "parent": "8M-5M",
      "name": "Meetups from the map: the view and the page",
      "status": "done",
      "start": "2026-10-17T13:29",
      "end": "2026-10-17T13:35"
    },
    {
      "id": "8M-5M.5",
      "kind": "task",
      "parent": "8M-5M",
      "name": "Meetups from the map: docs and staging checklist",
      "status": "done",
      "start": "2026-10-17T13:35",
      "end": "2026-10-17T13:36"
    },
    {
      "id": "8M-6",
      "kind": "plan",
      "parent": "11",
      "name": "8M-6 Web: the map's small fixes",
      "status": "done",
      "size": 0.4,
      "dependsOn": [
        "8M-5M"
      ],
      "scope": "The Minors the web-map plans 8M-1 to 8M-5M left open (follow-ups), /raid's access gap, the page's colours and sizes as named values for the visual pass at staging",
      "doneWhen": "The fixes on the test server and the page looking as before",
      "planning": {
        "start": "2026-10-17T14:45",
        "end": "2026-10-17T16:41",
        "review": {
          "start": "2026-10-17T16:01",
          "end": "2026-10-17T16:27"
        }
      },
      "review": {
        "start": "2026-10-17T16:47",
        "end": "2026-10-17T17:06"
      }
    },
    {
      "id": "8M-6.1",
      "kind": "task",
      "parent": "8M-6",
      "name": "Web map small fixes: the region editor's leftovers",
      "status": "done",
      "start": "2026-10-17T16:41",
      "end": "2026-10-17T16:43"
    },
    {
      "id": "8M-6.2",
      "kind": "task",
      "parent": "8M-6",
      "name": "Web map small fixes: the map page's leftovers",
      "status": "done",
      "start": "2026-10-17T16:43",
      "end": "2026-10-17T16:44"
    },
    {
      "id": "8M-6.3",
      "kind": "task",
      "parent": "8M-6",
      "name": "Web map small fixes: /raid's access gap",
      "status": "done",
      "start": "2026-10-17T16:44",
      "end": "2026-10-17T16:45"
    },
    {
      "id": "8M-6.4",
      "kind": "task",
      "parent": "8M-6",
      "name": "Web map small fixes: the page's look as named values",
      "status": "done",
      "start": "2026-10-17T16:45",
      "end": "2026-10-17T16:47"
    },
    {
      "id": "8M-6.5",
      "kind": "task",
      "parent": "8M-6",
      "name": "Web map small fixes: docs and staging checklist",
      "status": "done",
      "start": "2026-10-17T16:47",
      "end": "2026-10-17T16:47"
    },
    {
      "id": "8M-7",
      "kind": "plan",
      "parent": "11",
      "name": "8M-7 Web polish: the frame",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "8M-6"
      ],
      "scope": "The look light and dark, Stadia tiles, zoom limits and start view, your location, layers with defaults and the phone sheet, gym clustering, raid markers by zoom, the list with its sorts, settings.distanceUnits for the map and Discord",
      "doneWhen": "The map on a phone and a desktop through dev.example.com, light and dark",
      "planning": {
        "start": "2026-10-25T15:16",
        "end": "2026-10-25T19:55",
        "review": {
          "start": "2026-10-25T16:37",
          "end": "2026-10-25T19:39"
        }
      },
      "review": {
        "start": "2026-10-25T20:09",
        "end": "2026-10-25T21:03"
      }
    },
    {
      "id": "8M-7.1",
      "kind": "task",
      "parent": "8M-7",
      "name": "Web polish: the pages in Discord’s look, light and dark",
      "status": "done",
      "start": "2026-10-25T19:55",
      "end": "2026-10-25T19:59"
    },
    {
      "id": "8M-7.2",
      "kind": "task",
      "parent": "8M-7",
      "name": "Web polish: Stadia Maps’ tiles, OpenStreetMap to fall back to",
      "status": "done",
      "start": "2026-10-25T19:59",
      "end": "2026-10-25T20:01"
    },
    {
      "id": "8M-7.3",
      "kind": "task",
      "parent": "8M-7",
      "name": "Web polish: zoom limits, the start view, your location",
      "status": "done",
      "start": "2026-10-25T20:01",
      "end": "2026-10-25T20:02"
    },
    {
      "id": "8M-7.4",
      "kind": "task",
      "parent": "8M-7",
      "name": "Web polish: the layers, gyms clustered, stops and Power Spots",
      "status": "done",
      "start": "2026-10-25T20:02",
      "end": "2026-10-25T20:03"
    },
    {
      "id": "8M-7.5",
      "kind": "task",
      "parent": "8M-7",
      "name": "Web polish: raid markers, several things at one place",
      "status": "done",
      "start": "2026-10-25T20:03",
      "end": "2026-10-25T20:05"
    },
    {
      "id": "8M-7.6",
      "kind": "task",
      "parent": "8M-7",
      "name": "Web polish: the list of what is on",
      "status": "done",
      "start": "2026-10-25T20:05",
      "end": "2026-10-25T20:07"
    },
    {
      "id": "8M-7.7",
      "kind": "task",
      "parent": "8M-7",
      "name": "Web polish: one distance wording by a setting",
      "status": "done",
      "start": "2026-10-25T20:07",
      "end": "2026-10-25T20:09"
    },
    {
      "id": "8M-8A",
      "kind": "plan",
      "parent": "11",
      "name": "8M-8A Web polish: a party’s popup is its post",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "8M-7"
      ],
      "scope": "The post’s own layout drawn on the map and in a phone card: roles on blocks, the posts’ markdown as nodes, the post view and its key, pictures served by Pine, today’s controls behind the post’s buttons, times in the reader’s zone",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-25T22:23",
        "end": "2026-10-26T04:16",
        "review": {
          "start": "2026-10-26T01:27",
          "end": "2026-10-26T03:58"
        }
      },
      "review": {
        "start": "2026-10-26T04:29",
        "end": "2026-10-26T04:58"
      }
    },
    {
      "id": "8M-8A.1",
      "kind": "task",
      "parent": "8M-8A",
      "name": "Post popups: roles on a post’s blocks",
      "status": "done",
      "start": "2026-10-26T04:16",
      "end": "2026-10-26T04:18"
    },
    {
      "id": "8M-8A.2",
      "kind": "task",
      "parent": "8M-8A",
      "name": "Post popups: a post’s text read into nodes",
      "status": "done",
      "start": "2026-10-26T04:18",
      "end": "2026-10-26T04:21"
    },
    {
      "id": "8M-8A.3",
      "kind": "task",
      "parent": "8M-8A",
      "name": "Post popups: a party’s post as data for the map",
      "status": "done",
      "start": "2026-10-26T04:21",
      "end": "2026-10-26T04:23"
    },
    {
      "id": "8M-8A.4",
      "kind": "task",
      "parent": "8M-8A",
      "name": "Post popups: the post’s pictures served by Pine",
      "status": "done",
      "start": "2026-10-26T04:23",
      "end": "2026-10-26T04:24"
    },
    {
      "id": "8M-8A.5",
      "kind": "task",
      "parent": "8M-8A",
      "name": "Post popups: a party’s popup is its post",
      "status": "done",
      "start": "2026-10-26T04:24",
      "end": "2026-10-26T04:26"
    },
    {
      "id": "8M-8A.6",
      "kind": "task",
      "parent": "8M-8A",
      "name": "Post popups: the phone card, and the list’s focus",
      "status": "done",
      "start": "2026-10-26T04:26",
      "end": "2026-10-26T04:28"
    },
    {
      "id": "8M-8A.7",
      "kind": "task",
      "parent": "8M-8A",
      "name": "Post popups: the docs and the staging checklist",
      "status": "done",
      "start": "2026-10-26T04:28",
      "end": "2026-10-26T04:29"
    },
    {
      "id": "8M-8B",
      "kind": "plan",
      "parent": "11",
      "name": "8M-8B Web polish: the post’s controls as web forms",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "8M-8A"
      ],
      "scope": "Group… (choose or move), Meet…, +1s, Set time…’s missing parts, the raid’s changes under Discord’s rule, staff’s delete, Report to moderators, the completion question",
      "planning": {
        "start": "2026-10-26T05:09",
        "end": "2026-10-26T08:55",
        "review": {
          "start": "2026-10-26T06:21",
          "end": "2026-10-26T07:49"
        }
      },
      "review": {
        "start": "2026-10-26T09:06",
        "end": "2026-10-26T11:12"
      }
    },
    {
      "id": "8M-8B.1",
      "kind": "task",
      "parent": "8M-8B",
      "name": "Post controls: who may change a raid, the view's version",
      "status": "done",
      "start": "2026-10-26T08:55",
      "end": "2026-10-26T08:58"
    },
    {
      "id": "8M-8B.2",
      "kind": "task",
      "parent": "8M-8B",
      "name": "Post controls: +1, -1 and the completion question",
      "status": "done",
      "start": "2026-10-26T08:58",
      "end": "2026-10-26T09:00"
    },
    {
      "id": "8M-8B.3",
      "kind": "task",
      "parent": "8M-8B",
      "name": "Post controls: Group...",
      "status": "done",
      "start": "2026-10-26T09:00",
      "end": "2026-10-26T09:01"
    },
    {
      "id": "8M-8B.4",
      "kind": "task",
      "parent": "8M-8B",
      "name": "Post controls: Meet...",
      "status": "done",
      "start": "2026-10-26T09:01",
      "end": "2026-10-26T09:02"
    },
    {
      "id": "8M-8B.5",
      "kind": "task",
      "parent": "8M-8B",
      "name": "Post controls: staff's Delete...",
      "status": "done",
      "start": "2026-10-26T09:02",
      "end": "2026-10-26T09:04"
    },
    {
      "id": "8M-8B.6",
      "kind": "task",
      "parent": "8M-8B",
      "name": "Post controls: Report... to the moderators",
      "status": "done",
      "start": "2026-10-26T09:04",
      "end": "2026-10-26T09:05"
    },
    {
      "id": "8M-8B.7",
      "kind": "task",
      "parent": "8M-8B",
      "name": "Post controls: docs and the staging checklist",
      "status": "done",
      "start": "2026-10-26T09:05",
      "end": "2026-10-26T09:06"
    },
    {
      "id": "8E",
      "kind": "plan",
      "parent": "11",
      "name": "8E An elite raid blocks its gym",
      "status": "done",
      "size": 0.3,
      "dependsOn": [
        "8M-8B"
      ],
      "scope": "One raid per gym of any kind (Matt, 2026-10-26): one domain function for the raid at a gym, used by every report, /location and raid changes; the web stagings start with web:build; the Cloudflare beacon note",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-27T00:49",
        "end": "2026-10-27T04:24",
        "review": {
          "start": "2026-10-27T03:37",
          "end": "2026-10-27T04:20"
        }
      },
      "review": {
        "start": "2026-10-27T04:28",
        "end": "2026-10-27T05:14"
      }
    },
    {
      "id": "8E.1",
      "kind": "task",
      "parent": "8E",
      "name": "One raid per gym of any kind and server, one domain function",
      "status": "done",
      "start": "2026-10-27T04:24",
      "end": "2026-10-27T04:28"
    },
    {
      "id": "8E.2",
      "kind": "task",
      "parent": "8E",
      "name": "Docs, the web stagings' build step, the Cloudflare note",
      "status": "done",
      "start": "2026-10-27T04:28",
      "end": "2026-10-27T04:29"
    },
    {
      "id": "8M-8C",
      "kind": "plan",
      "parent": "11",
      "name": "8M-8C Web polish: trains’ Split…, Manage… and the route editor",
      "status": "done",
      "size": 0.7,
      "dependsOn": [
        "8E"
      ],
      "scope": "Split…, Manage…’s parts beyond the conductor and kind, the drag-to-reorder route editor",
      "planning": {
        "start": "2026-10-27T05:33",
        "end": "2026-10-27T10:03",
        "review": {
          "start": "2026-10-27T07:02",
          "end": "2026-10-27T09:38"
        }
      },
      "review": {
        "start": "2026-10-27T10:19",
        "end": "2026-10-27T10:45"
      }
    },
    {
      "id": "8M-8C.1",
      "kind": "task",
      "parent": "8M-8C",
      "name": "The train dialogs' logic as shared functions",
      "status": "done",
      "start": "2026-10-27T10:03",
      "end": "2026-10-27T10:07"
    },
    {
      "id": "8M-8C.2",
      "kind": "task",
      "parent": "8M-8C",
      "name": "Manage… on the map as the post's dialog",
      "status": "done",
      "start": "2026-10-27T10:07",
      "end": "2026-10-27T10:09"
    },
    {
      "id": "8M-8C.3",
      "kind": "task",
      "parent": "8M-8C",
      "name": "Move… on the map as the post's dialog",
      "status": "done",
      "start": "2026-10-27T10:09",
      "end": "2026-10-27T10:11"
    },
    {
      "id": "8M-8C.4",
      "kind": "task",
      "parent": "8M-8C",
      "name": "Split… on the map as the post's dialog",
      "status": "done",
      "start": "2026-10-27T10:11",
      "end": "2026-10-27T10:14"
    },
    {
      "id": "8M-8C.5",
      "kind": "task",
      "parent": "8M-8C",
      "name": "Route mode adds a Power Spot by a tap; Route says what lies ahead",
      "status": "done",
      "start": "2026-10-27T10:14",
      "end": "2026-10-27T10:16"
    },
    {
      "id": "8M-8C.6",
      "kind": "task",
      "parent": "8M-8C",
      "name": "A stop dragged in the stop list of route mode",
      "status": "done",
      "start": "2026-10-27T10:16",
      "end": "2026-10-27T10:17"
    },
    {
      "id": "8M-8C.7",
      "kind": "task",
      "parent": "8M-8C",
      "name": "Docs, the controls table and the staging checklist",
      "status": "done",
      "start": "2026-10-27T10:17",
      "end": "2026-10-27T10:19"
    },
    {
      "id": "8M-9A",
      "kind": "plan",
      "parent": "11",
      "name": "8M-9A Web polish: the Report button, max battles and Power Spots",
      "status": "done",
      "size": 0.6,
      "dependsOn": [
        "8M-8C"
      ],
      "scope": "One Report button through what, where and the command’s form; max battles drawn, listed and reported; Power Spot popups; the game’s icons on the menu; Gyms off by default",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-27T11:05",
        "end": "2026-10-27T14:15",
        "review": {
          "start": "2026-10-27T12:42",
          "end": "2026-10-27T14:03"
        }
      },
      "review": {
        "start": "2026-10-27T14:22",
        "end": "2026-10-27T15:34"
      }
    },
    {
      "id": "8M-9A.1",
      "kind": "task",
      "parent": "8M-9A",
      "name": "Max battles drawn, their popups and their lines",
      "status": "done",
      "start": "2026-10-27T14:15",
      "end": "2026-10-27T14:17"
    },
    {
      "id": "8M-9A.2",
      "kind": "task",
      "parent": "8M-9A",
      "name": "Power Spot popups and the max battle form",
      "status": "done",
      "start": "2026-10-27T14:17",
      "end": "2026-10-27T14:19"
    },
    {
      "id": "8M-9A.3",
      "kind": "task",
      "parent": "8M-9A",
      "name": "The Report button, its menu and icons; Gyms off by default",
      "status": "done",
      "start": "2026-10-27T14:19",
      "end": "2026-10-27T14:20"
    },
    {
      "id": "8M-9A.4",
      "kind": "task",
      "parent": "8M-9A",
      "name": "Step 2 per kind and the hand-off to the form",
      "status": "done",
      "start": "2026-10-27T14:20",
      "end": "2026-10-27T14:21"
    },
    {
      "id": "8M-9A.5",
      "kind": "task",
      "parent": "8M-9A",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-27T14:21",
      "end": "2026-10-27T14:22"
    },
    {
      "id": "8M-9B",
      "kind": "plan",
      "parent": "11",
      "name": "8M-9B Web polish: reports at stops on the map",
      "status": "done",
      "size": 0.6,
      "dependsOn": [
        "8M-9A"
      ],
      "scope": "The field research and Team GO Rocket layer, their popups and take-back, reporting both from the map with the research pickers, versions and asks, the filters; a choice an event boundary made stale refused as on Discord",
      "planning": {
        "start": "2026-10-27T16:12",
        "end": "2026-10-27T20:28",
        "review": {
          "start": "2026-10-27T18:08",
          "end": "2026-10-27T19:59"
        }
      },
      "doneWhen": "Merged into typescript-migration",
      "review": {
        "start": "2026-10-27T20:45",
        "end": "2026-10-27T22:30"
      }
    },
    {
      "id": "8M-9B.1",
      "kind": "task",
      "parent": "8M-9B",
      "name": "Square pictures, backAtWords, reason and version rewards on the server",
      "status": "done",
      "start": "2026-10-27T20:28",
      "end": "2026-10-27T20:32"
    },
    {
      "id": "8M-9B.2",
      "kind": "task",
      "parent": "8M-9B",
      "name": "The research and Rocket layers, their poll and markers",
      "status": "done",
      "start": "2026-10-27T20:32",
      "end": "2026-10-27T20:34"
    },
    {
      "id": "8M-9B.3",
      "kind": "task",
      "parent": "8M-9B",
      "name": "The list’s Field research and Team GO Rocket groups",
      "status": "done",
      "start": "2026-10-27T20:34",
      "end": "2026-10-27T20:36"
    },
    {
      "id": "8M-9B.4",
      "kind": "task",
      "parent": "8M-9B",
      "name": "A stop’s popup and card, with Take back",
      "status": "done",
      "start": "2026-10-27T20:36",
      "end": "2026-10-27T20:37"
    },
    {
      "id": "8M-9B.5",
      "kind": "task",
      "parent": "8M-9B",
      "name": "Filters of the reports at stops",
      "status": "done",
      "start": "2026-10-27T20:37",
      "end": "2026-10-27T20:39"
    },
    {
      "id": "8M-9B.6",
      "kind": "task",
      "parent": "8M-9B",
      "name": "Research and Rocket in the Report menu; step 2 at PokéStops",
      "status": "done",
      "start": "2026-10-27T20:39",
      "end": "2026-10-27T20:41"
    },
    {
      "id": "8M-9B.7",
      "kind": "task",
      "parent": "8M-9B",
      "name": "The Team GO Rocket form",
      "status": "done",
      "start": "2026-10-27T20:41",
      "end": "2026-10-27T20:42"
    },
    {
      "id": "8M-9B.8",
      "kind": "task",
      "parent": "8M-9B",
      "name": "The field research form and Same task at more stops",
      "status": "done",
      "start": "2026-10-27T20:42",
      "end": "2026-10-27T20:44"
    },
    {
      "id": "8M-9B.9",
      "kind": "task",
      "parent": "8M-9B",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-27T20:44",
      "end": "2026-10-27T20:45"
    },
    {
      "id": "8M-10",
      "kind": "plan",
      "parent": "11",
      "name": "8M-10 Web polish: the Edit regions toggle",
      "status": "done",
      "size": 0.3,
      "dependsOn": [
        "8M-7"
      ],
      "scope": "The region editor as a toggle of the map, desktop only, without zoom limits",
      "planning": {
        "start": "2026-10-28T00:59",
        "end": "2026-10-28T02:54",
        "review": {
          "start": "2026-10-28T01:53",
          "end": "2026-10-28T02:40"
        }
      },
      "doneWhen": "Merged into typescript-migration",
      "review": {
        "start": "2026-10-28T03:02",
        "end": "2026-10-28T03:49"
      }
    },
    {
      "id": "8M-10.1",
      "kind": "task",
      "parent": "8M-10",
      "name": "The map’s hint of the editor and its refusals in words",
      "status": "done",
      "start": "2026-10-28T02:54",
      "end": "2026-10-28T02:56"
    },
    {
      "id": "8M-10.2",
      "kind": "task",
      "parent": "8M-10",
      "name": "The editor’s address leads to the map",
      "status": "done",
      "start": "2026-10-28T02:56",
      "end": "2026-10-28T02:57"
    },
    {
      "id": "8M-10.3",
      "kind": "task",
      "parent": "8M-10",
      "name": "The editor opened and closed through a mount",
      "status": "done",
      "start": "2026-10-28T02:57",
      "end": "2026-10-28T02:58"
    },
    {
      "id": "8M-10.4",
      "kind": "task",
      "parent": "8M-10",
      "name": "Edit regions turns the editor on over the map",
      "status": "done",
      "start": "2026-10-28T02:58",
      "end": "2026-10-28T02:59"
    },
    {
      "id": "8M-10.5",
      "kind": "task",
      "parent": "8M-10",
      "name": "The editor in the map’s look; No overlaps or gaps",
      "status": "done",
      "start": "2026-10-28T02:59",
      "end": "2026-10-28T03:00"
    },
    {
      "id": "8M-10.6",
      "kind": "task",
      "parent": "8M-10",
      "name": "Fix and Fix all slivers in a box beside the sliver",
      "status": "done",
      "start": "2026-10-28T03:00",
      "end": "2026-10-28T03:01"
    },
    {
      "id": "8M-10.7",
      "kind": "task",
      "parent": "8M-10",
      "name": "Shared corners move together",
      "status": "done",
      "start": "2026-10-28T03:01",
      "end": "2026-10-28T03:02"
    },
    {
      "id": "8M-10.8",
      "kind": "task",
      "parent": "8M-10",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-28T03:02",
      "end": "2026-10-28T03:02"
    },
    {
      "id": "8M-11A",
      "kind": "plan",
      "parent": "11",
      "name": "8M-11A Web fix pass: answers and small fixes",
      "status": "done",
      "size": 0.5,
      "dependsOn": [
        "8M-10"
      ],
      "scope": "A press waits for its post (S1), answers where the member looks, the notice band, S2–S6, S11, S16–S19, S22, S26, S28, Power Spots nearest, the icons (S14)",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-28T13:19",
        "end": "2026-10-28T19:24",
        "review": {
          "start": "2026-10-28T15:25",
          "end": "2026-10-28T16:34"
        }
      },
      "review": {
        "start": "2026-10-28T19:40",
        "end": "2026-10-28T19:55"
      }
    },
    {
      "id": "8M-11A.1",
      "kind": "task",
      "parent": "8M-11A",
      "name": "A change on the map answers once its post shows it",
      "status": "done",
      "start": "2026-10-28T19:24",
      "end": "2026-10-28T19:28"
    },
    {
      "id": "8M-11A.2",
      "kind": "task",
      "parent": "8M-11A",
      "name": "Answers where the member looks; the notice band",
      "status": "done",
      "start": "2026-10-28T19:28",
      "end": "2026-10-28T19:30"
    },
    {
      "id": "8M-11A.3",
      "kind": "task",
      "parent": "8M-11A",
      "name": "The map’s small fixes (S2, S3, S4, S5, S11, S16, S22)",
      "status": "done",
      "start": "2026-10-28T19:30",
      "end": "2026-10-28T19:32"
    },
    {
      "id": "8M-11A.4",
      "kind": "task",
      "parent": "8M-11A",
      "name": "One wording of times on the map",
      "status": "done",
      "start": "2026-10-28T19:32",
      "end": "2026-10-28T19:34"
    },
    {
      "id": "8M-11A.5",
      "kind": "task",
      "parent": "8M-11A",
      "name": "Research forms leave out held stops; Change task",
      "status": "done",
      "start": "2026-10-28T19:34",
      "end": "2026-10-28T19:36"
    },
    {
      "id": "8M-11A.6",
      "kind": "task",
      "parent": "8M-11A",
      "name": "The nearest Power Spots and stops for Report; the start log once",
      "status": "done",
      "start": "2026-10-28T19:36",
      "end": "2026-10-28T19:37"
    },
    {
      "id": "8M-11A.7",
      "kind": "task",
      "parent": "8M-11A",
      "name": "The Report menu’s icons and the train emoji",
      "status": "done",
      "start": "2026-10-28T19:37",
      "end": "2026-10-28T19:39"
    },
    {
      "id": "8M-11A.8",
      "kind": "task",
      "parent": "8M-11A",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-28T19:39",
      "end": "2026-10-28T19:40"
    },
    {
      "id": "8M-11B",
      "kind": "plan",
      "parent": "11",
      "name": "8M-11B Web fix pass: trains and clusters",
      "status": "done",
      "size": 0.4,
      "dependsOn": [
        "8M-11A"
      ],
      "scope": "A train’s line shows its way (S27), the drag line (S24), a held stop holds the map (S25), fewer smoother gym clusters (S13)",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-28T20:29",
        "end": "2026-10-28T21:45",
        "review": {
          "start": "2026-10-28T21:11",
          "end": "2026-10-28T21:32"
        }
      },
      "review": {
        "start": "2026-10-28T21:50",
        "end": "2026-10-28T22:18"
      }
    },
    {
      "id": "8M-11B.1",
      "kind": "task",
      "parent": "8M-11B",
      "name": "A train’s line shows its way on the map",
      "status": "done",
      "start": "2026-10-28T21:45",
      "end": "2026-10-28T21:46"
    },
    {
      "id": "8M-11B.2",
      "kind": "task",
      "parent": "8M-11B",
      "name": "The drag line and the held map",
      "status": "done",
      "start": "2026-10-28T21:46",
      "end": "2026-10-28T21:47"
    },
    {
      "id": "8M-11B.3",
      "kind": "task",
      "parent": "8M-11B",
      "name": "Fewer, smoother gym clusters",
      "status": "done",
      "start": "2026-10-28T21:47",
      "end": "2026-10-28T21:48"
    },
    {
      "id": "8M-11B.4",
      "kind": "task",
      "parent": "8M-11B",
      "name": "An invite for a logged-in visitor not in the server",
      "status": "done",
      "start": "2026-10-28T21:48",
      "end": "2026-10-28T21:49"
    },
    {
      "id": "8M-11B.5",
      "kind": "task",
      "parent": "8M-11B",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-28T21:49",
      "end": "2026-10-28T21:50"
    },
    {
      "id": "8M-11C",
      "kind": "plan",
      "parent": "11",
      "name": "8M-11C Web fix pass: the region editor",
      "status": "done",
      "size": 0.3,
      "dependsOn": [
        "8M-11B"
      ],
      "scope": "The editor for a computer with a mouse (S29), its layers clustered (S30), what is unsaved (S31), a shared corner deleted everywhere (S32)",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-28T22:26",
        "end": "2026-10-29T00:27",
        "review": {
          "start": "2026-10-28T23:11",
          "end": "2026-10-29T00:26"
        }
      },
      "review": {
        "start": "2026-10-29T00:35",
        "end": "2026-10-29T01:01"
      }
    },
    {
      "id": "8M-11C.1",
      "kind": "task",
      "parent": "8M-11C",
      "name": "The editor offered with a mouse and 1024 pixels",
      "status": "done",
      "start": "2026-10-29T00:27",
      "end": "2026-10-29T00:32"
    },
    {
      "id": "8M-11C.2",
      "kind": "task",
      "parent": "8M-11C",
      "name": "The editor's places clustered, the warning ring",
      "status": "done",
      "start": "2026-10-29T00:32",
      "end": "2026-10-29T00:32"
    },
    {
      "id": "8M-11C.3",
      "kind": "task",
      "parent": "8M-11C",
      "name": "What is unsaved, in the menu and the editor",
      "status": "done",
      "start": "2026-10-29T00:32",
      "end": "2026-10-29T00:32"
    },
    {
      "id": "8M-11C.4",
      "kind": "task",
      "parent": "8M-11C",
      "name": "A shared corner deleted in every region that has it",
      "status": "done",
      "start": "2026-10-29T00:32",
      "end": "2026-10-29T00:33"
    },
    {
      "id": "8M-11C.5",
      "kind": "task",
      "parent": "8M-11C",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-29T00:33",
      "end": "2026-10-29T00:35"
    },
    {
      "id": "8M-12",
      "kind": "plan",
      "parent": "11",
      "name": "8M-12 Find on the web map",
      "status": "done",
      "size": 0.4,
      "dependsOn": [
        "8M-11C"
      ],
      "scope": "One box finds the research and Rocket reported today, the parties going on, and places by name; results in the list pane, sorted by distance (S23)",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-29T01:08",
        "end": "2026-10-29T02:29",
        "review": {
          "start": "2026-10-29T01:40",
          "end": "2026-10-29T02:19"
        }
      },
      "review": {
        "start": "2026-10-29T02:34",
        "end": "2026-10-29T03:14"
      }
    },
    {
      "id": "8M-12.1",
      "kind": "task",
      "parent": "8M-12",
      "name": "What Find finds a report at a stop by",
      "status": "done",
      "start": "2026-10-29T02:29",
      "end": "2026-10-29T02:31"
    },
    {
      "id": "8M-12.2",
      "kind": "task",
      "parent": "8M-12",
      "name": "Find's places by name",
      "status": "done",
      "start": "2026-10-29T02:31",
      "end": "2026-10-29T02:32"
    },
    {
      "id": "8M-12.3",
      "kind": "task",
      "parent": "8M-12",
      "name": "Find on the map's page",
      "status": "done",
      "start": "2026-10-29T02:32",
      "end": "2026-10-29T02:33"
    },
    {
      "id": "8M-12.4",
      "kind": "task",
      "parent": "8M-12",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-29T02:33",
      "end": "2026-10-29T02:34"
    },
    {
      "id": "12",
      "kind": "phase",
      "name": "Party history",
      "dependsOn": [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7"
      ],
      "scope": "Every ended party recorded in relational tables, the opt-in, the legacy import",
      "doneWhen": "The legacy parties imported and new ones recorded on staging"
    },
    {
      "id": "8H",
      "kind": "plan",
      "parent": "12",
      "name": "8H Party history: tables, recording, opt-in, legacy import",
      "size": 1,
      "dependsOn": [
        "8C"
      ],
      "scope": "Relational history of every ended party, member ids only with opt-in, the import of the legacy parties folder",
      "planning": {
        "start": "2026-10-16T05:50",
        "end": "2026-10-16T13:29",
        "review": {
          "start": "2026-10-16T09:08",
          "end": "2026-10-16T13:09"
        }
      },
      "status": "done",
      "review": {
        "start": "2026-10-16T13:46",
        "end": "2026-10-16T14:59"
      }
    },
    {
      "id": "8H.1",
      "kind": "task",
      "parent": "8H",
      "name": "The history tables (migration 018)",
      "status": "done",
      "start": "2026-10-16T13:29",
      "end": "2026-10-16T13:36"
    },
    {
      "id": "8H.2",
      "kind": "task",
      "parent": "8H",
      "name": "The opt-in",
      "status": "done",
      "start": "2026-10-16T13:36",
      "end": "2026-10-16T13:38"
    },
    {
      "id": "8H.3",
      "kind": "task",
      "parent": "8H",
      "name": "Recording every ended party",
      "status": "done",
      "start": "2026-10-16T13:38",
      "end": "2026-10-16T13:39"
    },
    {
      "id": "8H.4",
      "kind": "task",
      "parent": "8H",
      "name": "The legacy import",
      "status": "done",
      "start": "2026-10-16T13:39",
      "end": "2026-10-16T13:41"
    },
    {
      "id": "8H.5",
      "kind": "task",
      "parent": "8H",
      "name": "The questions as SQL",
      "status": "done",
      "start": "2026-10-16T13:41",
      "end": "2026-10-16T13:44"
    },
    {
      "id": "8H.6",
      "kind": "task",
      "parent": "8H",
      "name": "Docs",
      "status": "done",
      "start": "2026-10-16T13:44",
      "end": "2026-10-16T13:46"
    },
    {
      "id": "13",
      "kind": "phase",
      "name": "Moderation",
      "dependsOn": [
        "8"
      ],
      "scope": "Meetup places checked and requests to the moderators, rulings, blocks and appeals; reports with /report and the Apps menu, /delete, /places",
      "doneWhen": "Every plan staged with a moderator and a member"
    },
    {
      "id": "8S-1",
      "kind": "plan",
      "parent": "13",
      "name": "8S-1 Meetup safety: places that need a moderator",
      "status": "done",
      "size": 1,
      "dependsOn": [
        "8D"
      ],
      "scope": "Design 2026-10-17-meetup-safety-design.md: /meetup asks place, start and description; pins and yard-feature Wayspots wait for a moderator in a staff-only channel (settings.channels.moderation); rulings allow or refuse a place for good; staff skip; blocks with appeals; requests expire",
      "doneWhen": "Merged into typescript-migration with its staging checklist",
      "planning": {
        "start": "2026-10-17T01:51",
        "end": "2026-10-17T09:46",
        "review": {
          "start": "2026-10-17T04:10",
          "end": "2026-10-17T09:45"
        }
      },
      "review": {
        "start": "2026-10-17T09:57",
        "end": "2026-10-17T10:33"
      }
    },
    {
      "id": "8S-1.1",
      "kind": "task",
      "parent": "8S-1",
      "name": "Settings and the pure check",
      "status": "done",
      "start": "2026-10-17T09:46",
      "end": "2026-10-17T09:48"
    },
    {
      "id": "8S-1.2",
      "kind": "task",
      "parent": "8S-1",
      "name": "Migration and repositories",
      "status": "done",
      "start": "2026-10-17T09:48",
      "end": "2026-10-17T09:51"
    },
    {
      "id": "8S-1.3",
      "kind": "task",
      "parent": "8S-1",
      "name": "/meetup reshaped and the moderators’ post",
      "status": "done",
      "start": "2026-10-17T09:51",
      "end": "2026-10-17T09:53"
    },
    {
      "id": "8S-1.4",
      "kind": "task",
      "parent": "8S-1",
      "name": "The decision controls and expiry",
      "status": "done",
      "start": "2026-10-17T09:53",
      "end": "2026-10-17T09:54"
    },
    {
      "id": "8S-1.5",
      "kind": "task",
      "parent": "8S-1",
      "name": "Blocks and appeals",
      "status": "done",
      "start": "2026-10-17T09:54",
      "end": "2026-10-17T09:56"
    },
    {
      "id": "8S-1.6",
      "kind": "task",
      "parent": "8S-1",
      "name": "Start warning, cutover-check, docs",
      "status": "done",
      "start": "2026-10-17T09:56",
      "end": "2026-10-17T09:57"
    },
    {
      "id": "8S-2",
      "kind": "plan",
      "parent": "13",
      "name": "8S-2 Reports to the moderators, asks about places, /places",
      "status": "done",
      "size": 0.5,
      "dependsOn": [
        "8S-1"
      ],
      "scope": "Report on a meetup post to the moderators (throttled, one per member and meetup); /admin places: rulings, pending requests, blocks and appeals, with undo",
      "planning": {
        "start": "2026-10-17T14:45",
        "end": "2026-10-17T19:19",
        "review": {
          "start": "2026-10-17T16:54",
          "end": "2026-10-17T19:00"
        }
      },
      "review": {
        "start": "2026-10-17T19:32",
        "end": "2026-10-17T20:05"
      }
    },
    {
      "id": "8S-2.1",
      "kind": "task",
      "parent": "8S-2",
      "name": "Storage: reports, asks, the ruling source (migration 022)",
      "status": "done",
      "start": "2026-10-17T19:19",
      "end": "2026-10-17T19:24"
    },
    {
      "id": "8S-2.2",
      "kind": "task",
      "parent": "8S-2",
      "name": "Message commands in the framework",
      "status": "done",
      "start": "2026-10-17T19:24",
      "end": "2026-10-17T19:25"
    },
    {
      "id": "8S-2.3",
      "kind": "task",
      "parent": "8S-2",
      "name": "Party reports and /delete for staff",
      "status": "done",
      "start": "2026-10-17T19:25",
      "end": "2026-10-17T19:27"
    },
    {
      "id": "8S-2.4",
      "kind": "task",
      "parent": "8S-2",
      "name": "The moderators decide a party report",
      "status": "done",
      "start": "2026-10-17T19:27",
      "end": "2026-10-17T19:28"
    },
    {
      "id": "8S-2.5",
      "kind": "task",
      "parent": "8S-2",
      "name": "Report to moderators in the Apps menu",
      "status": "done",
      "start": "2026-10-17T19:28",
      "end": "2026-10-17T19:29"
    },
    {
      "id": "8S-2.6",
      "kind": "task",
      "parent": "8S-2",
      "name": "Asks about refused places",
      "status": "done",
      "start": "2026-10-17T19:29",
      "end": "2026-10-17T19:30"
    },
    {
      "id": "8S-2.7",
      "kind": "task",
      "parent": "8S-2",
      "name": "The places list and 8S-1 leftovers",
      "status": "done",
      "start": "2026-10-17T19:30",
      "end": "2026-10-17T19:31"
    },
    {
      "id": "8S-2.8",
      "kind": "task",
      "parent": "8S-2",
      "name": "Cutover check, docs, staging checklist",
      "status": "done",
      "start": "2026-10-17T19:31",
      "end": "2026-10-17T19:32"
    },
    {
      "id": "8S-3",
      "kind": "plan",
      "parent": "13",
      "name": "8S-3 Small fixes from the 8S-2 and web map staging",
      "status": "done",
      "size": 0.3,
      "dependsOn": [
        "8S-2"
      ],
      "scope": "Checks before a report form opens; a use given back when a failure is none of the member's doing; posts the bot may not make said plainly; staff roles must see the moderators' channel; the map's popups keep their clicks",
      "planning": {
        "start": "2026-10-18T12:20",
        "end": "2026-10-18T15:32",
        "review": {
          "start": "2026-10-18T13:16",
          "end": "2026-10-18T15:23"
        }
      },
      "review": {
        "start": "2026-10-18T16:31",
        "end": "2026-10-18T16:31"
      }
    },
    {
      "id": "8S-3.1",
      "kind": "task",
      "parent": "8S-3",
      "name": "Checks before the form (reports, asks, appeals)",
      "status": "done",
      "start": "2026-10-18T15:32",
      "end": "2026-10-18T15:34"
    },
    {
      "id": "8S-3.2",
      "kind": "task",
      "parent": "8S-3",
      "name": "The message line and the decided ask",
      "status": "done",
      "start": "2026-10-18T15:34",
      "end": "2026-10-18T15:35"
    },
    {
      "id": "8S-3.3",
      "kind": "task",
      "parent": "8S-3",
      "name": "A failed use gives its throttle back",
      "status": "done",
      "start": "2026-10-18T15:35",
      "end": "2026-10-18T15:36"
    },
    {
      "id": "8S-3.4",
      "kind": "task",
      "parent": "8S-3",
      "name": "Posts the bot may not make, said plainly",
      "status": "done",
      "start": "2026-10-18T15:36",
      "end": "2026-10-18T15:38"
    },
    {
      "id": "8S-3.5",
      "kind": "task",
      "parent": "8S-3",
      "name": "cutover-check, guides and docs",
      "status": "done",
      "start": "2026-10-18T15:38",
      "end": "2026-10-18T15:38"
    },
    {
      "id": "8S-3.6",
      "kind": "task",
      "parent": "8S-3",
      "name": "The web map: popups keep their clicks, logs, the login warning",
      "status": "done",
      "start": "2026-10-18T15:38",
      "end": "2026-10-18T15:40"
    },
    {
      "id": "8S-4",
      "kind": "plan",
      "parent": "13",
      "name": "8S-4 Full categories in the region import, small fixes from the 8S-3 staging",
      "status": "done",
      "size": 0.3,
      "dependsOn": [
        "8S-3"
      ],
      "scope": "Region import makes room past a full category; the failed approval post names the reason; a train at a gym no longer hides the gym on the map; two give-backs; checklist fixes",
      "planning": {
        "start": "2026-10-18T22:26",
        "end": "2026-10-19T01:15",
        "review": {
          "start": "2026-10-18T23:21",
          "end": "2026-10-18T23:21"
        }
      },
      "review": {
        "start": "2026-10-19T01:29",
        "end": "2026-10-19T02:08"
      }
    },
    {
      "id": "8S-4.1",
      "kind": "task",
      "parent": "8S-4",
      "name": "Full categories in the import plan and preview",
      "status": "done",
      "start": "2026-10-19T01:15",
      "end": "2026-10-19T01:18"
    },
    {
      "id": "8S-4.2",
      "kind": "task",
      "parent": "8S-4",
      "name": "The editor save and the full-category outcome",
      "status": "done",
      "start": "2026-10-19T01:18",
      "end": "2026-10-19T01:20"
    },
    {
      "id": "8S-4.3",
      "kind": "task",
      "parent": "8S-4",
      "name": "The failed approval reason in the post",
      "status": "done",
      "start": "2026-10-19T01:20",
      "end": "2026-10-19T01:23"
    },
    {
      "id": "8S-4.4",
      "kind": "task",
      "parent": "8S-4",
      "name": "A train at a gym drawn as a ring on the map",
      "status": "done",
      "start": "2026-10-19T01:23",
      "end": "2026-10-19T01:25"
    },
    {
      "id": "8S-4.5",
      "kind": "task",
      "parent": "8S-4",
      "name": "Two give-backs left from 8S-3",
      "status": "done",
      "start": "2026-10-19T01:25",
      "end": "2026-10-19T01:28"
    },
    {
      "id": "8S-4.6",
      "kind": "task",
      "parent": "8S-4",
      "name": "Docs, 8S-3 checklist fixes, 8S-4 staging checklist",
      "status": "done",
      "start": "2026-10-19T01:28",
      "end": "2026-10-19T01:29"
    },
    {
      "id": "14",
      "kind": "phase",
      "name": "Trains and groups",
      "dependsOn": [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7"
      ],
      "scope": "Splitting a group off a raid train into a train of its own",
      "doneWhen": "Staged with three accounts"
    },
    {
      "id": "8T",
      "kind": "plan",
      "parent": "14",
      "name": "8T Split a group off a raid train",
      "size": 1,
      "dependsOn": [
        "8D"
      ],
      "scope": "A train group becomes a train of its own (same route, stop, mode, boss, start; its members moved; both posts linked; the movers pinged): a Split group… button by Move train… and /group split, with a private confirmation. Design 2026-10-17-train-split-design.md (Matt, 2026-10-17)",
      "doneWhen": "Merged into typescript-migration with its staging checklist",
      "planning": {
        "start": "2026-10-17T08:38",
        "end": "2026-10-17T13:23",
        "review": {
          "start": "2026-10-17T10:42",
          "end": "2026-10-17T13:22"
        }
      },
      "status": "done",
      "review": {
        "start": "2026-10-17T13:33",
        "end": "2026-10-17T13:53"
      }
    },
    {
      "id": "8T.1",
      "kind": "task",
      "parent": "8T",
      "name": "Domain: splitting a train, who may, state document v11",
      "status": "done",
      "start": "2026-10-17T13:23",
      "end": "2026-10-17T13:26"
    },
    {
      "id": "8T.2",
      "kind": "task",
      "parent": "8T",
      "name": "History: the split step, the new train from the split, splitFromId",
      "status": "done",
      "start": "2026-10-17T13:26",
      "end": "2026-10-17T13:28"
    },
    {
      "id": "8T.3",
      "kind": "task",
      "parent": "8T",
      "name": "Service: the split as one change of two parties, take-back, ping",
      "status": "done",
      "start": "2026-10-17T13:28",
      "end": "2026-10-17T13:29"
    },
    {
      "id": "8T.4",
      "kind": "task",
      "parent": "8T",
      "name": "Posts: the links, the Split group button, the confirmation",
      "status": "done",
      "start": "2026-10-17T13:29",
      "end": "2026-10-17T13:31"
    },
    {
      "id": "8T.5",
      "kind": "task",
      "parent": "8T",
      "name": "/group split, the controls, splitGroupAs, help",
      "status": "done",
      "start": "2026-10-17T13:31",
      "end": "2026-10-17T13:32"
    },
    {
      "id": "8T.6",
      "kind": "task",
      "parent": "8T",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-17T13:32",
      "end": "2026-10-17T13:33"
    },
    {
      "id": "8T-F",
      "kind": "plan",
      "parent": "14",
      "name": "8T-F A train split as one transaction",
      "size": 0.5,
      "dependsOn": [
        "8T"
      ],
      "scope": "The two party writes of a split (the old train loses the group, the new one gets who went) in one database transaction, closing the restart window (Matt, 2026-10-17)",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-17T14:07",
        "end": "2026-10-17T15:16",
        "review": {
          "start": "2026-10-17T14:52",
          "end": "2026-10-17T15:05"
        }
      },
      "review": {
        "start": "2026-10-17T15:20",
        "end": "2026-10-17T15:42"
      },
      "status": "done"
    },
    {
      "id": "8T-F.1",
      "kind": "task",
      "parent": "8T-F",
      "name": "The store: one change of two parties in one transaction",
      "status": "done",
      "start": "2026-10-17T15:16",
      "end": "2026-10-17T15:18"
    },
    {
      "id": "8T-F.2",
      "kind": "task",
      "parent": "8T-F",
      "name": "The split on it: no window between the writes, docs",
      "status": "done",
      "start": "2026-10-17T15:18",
      "end": "2026-10-17T15:20"
    },
    {
      "id": "8T-G",
      "kind": "plan",
      "parent": "14",
      "name": "8T-G No conductor for an Anonymous presser",
      "size": 0.25,
      "dependsOn": [
        "8T-F"
      ],
      "scope": "Matt's ruling after the 8T staging run: a split's new train is not led by a presser whose privacy is Anonymous; the confirmation says so",
      "doneWhen": "Merged into typescript-migration",
      "review": {
        "start": "2026-10-17T23:47",
        "end": "2026-10-17T23:52"
      },
      "status": "done"
    },
    {
      "id": "8T-G.1",
      "kind": "task",
      "parent": "8T-G",
      "name": "The rule, the confirmation, the docs (tests first)",
      "status": "done",
      "start": "2026-10-17T23:20",
      "end": "2026-10-17T23:47"
    },
    {
      "id": "8T-H",
      "kind": "plan",
      "parent": "14",
      "name": "8T-H The split asked in a dialog",
      "size": 0.3,
      "dependsOn": [
        "8T-G"
      ],
      "scope": "The split confirmation becomes a Discord dialog: one-group text, a radio choice of groups for the conductor and staff",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-18T23:43",
        "end": "2026-10-19T01:49"
      },
      "review": {
        "start": "2026-10-19T01:49",
        "end": "2026-10-19T01:49"
      },
      "status": "done"
    },
    {
      "id": "8T-H.1",
      "kind": "task",
      "parent": "8T-H",
      "name": "The two dialogs, radio groups in the fake forms",
      "status": "done",
      "start": "2026-10-19T01:49",
      "end": "2026-10-19T01:49"
    },
    {
      "id": "8T-H.2",
      "kind": "task",
      "parent": "8T-H",
      "name": "Split group opens the dialog, its Submit splits",
      "status": "done",
      "start": "2026-10-19T01:49",
      "end": "2026-10-19T01:49"
    },
    {
      "id": "8Q",
      "kind": "plan",
      "parent": "14",
      "name": "8Q The one-shot questions as dialogs",
      "size": 0.3,
      "dependsOn": [
        "8T-H"
      ],
      "scope": "Remove all, /delete, the report post, gym delete, /region remove and /location ask in a dialog; the slow-read rule",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-18T23:53",
        "end": "2026-10-19T03:26"
      },
      "review": {
        "start": "2026-10-19T03:32",
        "end": "2026-10-19T03:53"
      },
      "status": "done"
    },
    {
      "id": "8Q.1",
      "kind": "task",
      "parent": "8Q",
      "name": "Shared dialog pieces, the slow-read rule",
      "status": "done",
      "start": "2026-10-19T03:26",
      "end": "2026-10-19T03:28"
    },
    {
      "id": "8Q.2",
      "kind": "task",
      "parent": "8Q",
      "name": "Remove all",
      "status": "done",
      "start": "2026-10-19T03:28",
      "end": "2026-10-19T03:28"
    },
    {
      "id": "8Q.3",
      "kind": "task",
      "parent": "8Q",
      "name": "/delete and the report post",
      "status": "done",
      "start": "2026-10-19T03:28",
      "end": "2026-10-19T03:29"
    },
    {
      "id": "8Q.4",
      "kind": "task",
      "parent": "8Q",
      "name": "Deleting a gym",
      "status": "done",
      "start": "2026-10-19T03:29",
      "end": "2026-10-19T03:30"
    },
    {
      "id": "8Q.5",
      "kind": "task",
      "parent": "8Q",
      "name": "/region remove",
      "status": "done",
      "start": "2026-10-19T03:30",
      "end": "2026-10-19T03:31"
    },
    {
      "id": "8Q.6",
      "kind": "task",
      "parent": "8Q",
      "name": "/location",
      "status": "done",
      "start": "2026-10-19T03:31",
      "end": "2026-10-19T03:32"
    },
    {
      "id": "8Q.7",
      "kind": "task",
      "parent": "8Q",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-19T03:32",
      "end": "2026-10-19T03:32"
    },
    {
      "id": "15",
      "kind": "phase",
      "name": "Max battles",
      "dependsOn": [
        "2",
        "3"
      ],
      "scope": "A new kind of party: Dynamax and Gigantamax raids (lobby of 4 or 100) and Max battle trains",
      "doneWhen": "To be designed"
    },
    {
      "id": "8X-D",
      "kind": "plan",
      "parent": "15",
      "name": "8X-D Max battles: brainstorm and design",
      "size": 0.3,
      "scope": "Brainstorm with Matt, research of the boss sources (Pokebattler, ScrapedDuck), design 2026-10-20-max-battles-design.md, a fresh review, Matt's answers",
      "doneWhen": "Design approved by Matt",
      "planning": {
        "start": "2026-10-20T14:40",
        "end": "2026-10-20T15:42"
      },
      "status": "done"
    },
    {
      "id": "8X-1",
      "kind": "plan",
      "parent": "15",
      "name": "8X-1 Lobby sizes and the group ping",
      "size": 0.5,
      "dependsOn": [
        "8X-D"
      ],
      "scope": "Lobby sizes per kind (settings.lobbies), Join filling groups for max battles and Gigantamax trains, n/cap coming, /shout group: in as many messages as it takes",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-20T16:00",
        "end": "2026-10-20T17:42",
        "review": {
          "start": "2026-10-20T16:53",
          "end": "2026-10-20T17:37"
        }
      },
      "review": {
        "start": "2026-10-20T17:47",
        "end": "2026-10-20T18:04"
      }
    },
    {
      "id": "8X-1.1",
      "kind": "task",
      "parent": "8X-1",
      "name": "Lobby sizes: the setting, lobbySize, lobbyCount",
      "status": "done",
      "start": "2026-10-20T17:42",
      "end": "2026-10-20T17:44"
    },
    {
      "id": "8X-1.2",
      "kind": "task",
      "parent": "8X-1",
      "name": "Join chooses the group where a party has a lobby size",
      "status": "done",
      "start": "2026-10-20T17:44",
      "end": "2026-10-20T17:45"
    },
    {
      "id": "8X-1.3",
      "kind": "task",
      "parent": "8X-1",
      "name": "The group line: n/cap coming",
      "status": "done",
      "start": "2026-10-20T17:45",
      "end": "2026-10-20T17:46"
    },
    {
      "id": "8X-1.4",
      "kind": "task",
      "parent": "8X-1",
      "name": "Shout in several messages, and group:",
      "status": "done",
      "start": "2026-10-20T17:46",
      "end": "2026-10-20T17:47"
    },
    {
      "id": "8X-1B",
      "kind": "plan",
      "parent": "15",
      "name": "8X-1B One layout of buttons, Group… and Meet…",
      "size": 1,
      "dependsOn": [
        "8X-1"
      ],
      "scope": "One layout for one group and several (status lines, three rows of buttons), the which-group dialog for newcomers, Group… (move, new) and Meet… (in-game RSVP times), empty groups pruned, a stamp per group (state version 12), the map following the post",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-20T20:32",
        "end": "2026-10-21T00:27",
        "review": {
          "start": "2026-10-20T22:33",
          "end": "2026-10-21T00:02"
        }
      },
      "review": {
        "start": "2026-10-21T00:35",
        "end": "2026-10-21T01:17"
      }
    },
    {
      "id": "8X-1B.1",
      "kind": "task",
      "parent": "8X-1B",
      "name": "A stamp per group, empty groups pruned, state version 12",
      "status": "done",
      "start": "2026-10-21T00:27",
      "end": "2026-10-21T00:29"
    },
    {
      "id": "8X-1B.2",
      "kind": "task",
      "parent": "8X-1B",
      "name": "One layout of buttons for one group and several",
      "status": "done",
      "start": "2026-10-21T00:29",
      "end": "2026-10-21T00:31"
    },
    {
      "id": "8X-1B.3",
      "kind": "task",
      "parent": "8X-1B",
      "name": "Which group, asked of a newcomer",
      "status": "done",
      "start": "2026-10-21T00:31",
      "end": "2026-10-21T00:32"
    },
    {
      "id": "8X-1B.4",
      "kind": "task",
      "parent": "8X-1B",
      "name": "Group...: move or open a group",
      "status": "done",
      "start": "2026-10-21T00:32",
      "end": "2026-10-21T00:33"
    },
    {
      "id": "8X-1B.5",
      "kind": "task",
      "parent": "8X-1B",
      "name": "Meet...: the group's meeting time",
      "status": "done",
      "start": "2026-10-21T00:33",
      "end": "2026-10-21T00:33"
    },
    {
      "id": "8X-1B.6",
      "kind": "task",
      "parent": "8X-1B",
      "name": "The map's group choice, help and docs",
      "status": "done",
      "start": "2026-10-21T00:33",
      "end": "2026-10-21T00:35"
    },
    {
      "id": "8X-2",
      "kind": "plan",
      "parent": "15",
      "name": "8X-2 Max bosses",
      "size": 0.7,
      "dependsOn": [
        "8X-D"
      ],
      "scope": "Max bosses from Pokebattler /raids per family in the RaidBoss tables, the featured boss from ScrapedDuck events, the game master Dynamax lists, overrides, /admin boss",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-20T20:32",
        "end": "2026-10-21T01:28",
        "review": {
          "start": "2026-10-20T23:05",
          "end": "2026-10-21T01:19"
        }
      },
      "review": {
        "start": "2026-10-21T01:32",
        "end": "2026-10-21T01:52"
      }
    },
    {
      "id": "8X-2.1",
      "kind": "task",
      "parent": "8X-2",
      "name": "Max tiers and the boss repository per family",
      "status": "done",
      "start": "2026-10-21T01:28",
      "end": "2026-10-21T01:30"
    },
    {
      "id": "8X-2.2",
      "kind": "task",
      "parent": "8X-2",
      "name": "The max boss feed, the game master's max lists, the service",
      "status": "done",
      "start": "2026-10-21T01:30",
      "end": "2026-10-21T01:31"
    },
    {
      "id": "8X-2.3",
      "kind": "task",
      "parent": "8X-2",
      "name": "Max events, the featured boss, the list's order",
      "status": "done",
      "start": "2026-10-21T01:31",
      "end": "2026-10-21T01:31"
    },
    {
      "id": "8X-2.4",
      "kind": "task",
      "parent": "8X-2",
      "name": "Max tiers in admin boss, docs",
      "status": "done",
      "start": "2026-10-21T01:31",
      "end": "2026-10-21T01:32"
    },
    {
      "id": "8X-3",
      "kind": "plan",
      "parent": "15",
      "name": "8X-3 The max battle",
      "size": 1.5,
      "dependsOn": [
        "8X-1",
        "8X-2",
        "8X-1B"
      ],
      "scope": "Party kind max at a Power Spot (or an unlisted pin), /max, the post, summary, one DM an hour per want, history, migration",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-21T03:30",
        "end": "2026-10-21T07:31",
        "review": {
          "start": "2026-10-21T05:20",
          "end": "2026-10-21T06:48"
        }
      },
      "review": {
        "start": "2026-10-21T07:40",
        "end": "2026-10-21T11:56"
      }
    },
    {
      "id": "8X-3.1",
      "kind": "task",
      "parent": "8X-3",
      "name": "The guards first: isTimed outright, battled kinds",
      "status": "done",
      "start": "2026-10-21T07:31",
      "end": "2026-10-21T07:34"
    },
    {
      "id": "8X-3.2",
      "kind": "task",
      "parent": "8X-3",
      "name": "The max battle as a kind of party, its state and its spot",
      "status": "done",
      "start": "2026-10-21T07:34",
      "end": "2026-10-21T07:35"
    },
    {
      "id": "8X-3.3",
      "kind": "task",
      "parent": "8X-3",
      "name": "Max battles always on, big events, the default end",
      "status": "done",
      "start": "2026-10-21T07:35",
      "end": "2026-10-21T07:36"
    },
    {
      "id": "8X-3.4",
      "kind": "task",
      "parent": "8X-3",
      "name": "The post, its forum and the summary",
      "status": "done",
      "start": "2026-10-21T07:36",
      "end": "2026-10-21T07:36"
    },
    {
      "id": "8X-3.5",
      "kind": "task",
      "parent": "8X-3",
      "name": "Max, and its boss, end and meeting time in the post",
      "status": "done",
      "start": "2026-10-21T07:36",
      "end": "2026-10-21T07:37"
    },
    {
      "id": "8X-3.6",
      "kind": "task",
      "parent": "8X-3",
      "name": "Wants and DMs of max battles",
      "status": "done",
      "start": "2026-10-21T07:37",
      "end": "2026-10-21T07:38"
    },
    {
      "id": "8X-3.7",
      "kind": "task",
      "parent": "8X-3",
      "name": "Max battles in the party history, migration 025",
      "status": "done",
      "start": "2026-10-21T07:38",
      "end": "2026-10-21T07:39"
    },
    {
      "id": "8X-3.8",
      "kind": "task",
      "parent": "8X-3",
      "name": "Docs",
      "status": "done",
      "start": "2026-10-21T07:39",
      "end": "2026-10-21T07:40"
    },
    {
      "id": "8X-4",
      "kind": "plan",
      "parent": "15",
      "name": "8X-4 Train kinds and mixed stops",
      "size": 1.5,
      "dependsOn": [
        "8X-1",
        "8X-1B"
      ],
      "scope": "Train kinds, stops that are gyms or Power Spots: routes, panel handles, saved routes, copies, history, /route add stop:",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-21T13:28",
        "end": "2026-10-21T22:57",
        "review": {
          "start": "2026-10-21T20:11",
          "end": "2026-10-21T22:31"
        }
      },
      "review": {
        "start": "2026-10-21T23:18",
        "end": "2026-10-21T23:38"
      }
    },
    {
      "id": "8X-4.1",
      "kind": "task",
      "parent": "8X-4",
      "name": "Train kinds, /train kind: and start:",
      "status": "done",
      "start": "2026-10-21T22:57",
      "end": "2026-10-21T23:01"
    },
    {
      "id": "8X-4.2",
      "kind": "task",
      "parent": "8X-4",
      "name": "Stops of a route as gyms or power spots",
      "status": "done",
      "start": "2026-10-21T23:01",
      "end": "2026-10-21T23:04"
    },
    {
      "id": "8X-4.3",
      "kind": "task",
      "parent": "8X-4",
      "name": "The kind of a train without a route, Manage train…",
      "status": "done",
      "start": "2026-10-21T23:04",
      "end": "2026-10-21T23:06"
    },
    {
      "id": "8X-4.4",
      "kind": "task",
      "parent": "8X-4",
      "name": "Choosing power spots as stops",
      "status": "done",
      "start": "2026-10-21T23:06",
      "end": "2026-10-21T23:08"
    },
    {
      "id": "8X-4.5",
      "kind": "task",
      "parent": "8X-4",
      "name": "Saved routes of gyms and power spots",
      "status": "done",
      "start": "2026-10-21T23:08",
      "end": "2026-10-21T23:11"
    },
    {
      "id": "8X-4.6",
      "kind": "task",
      "parent": "8X-4",
      "name": "Power spots and train kinds in the history, migration 026",
      "status": "done",
      "start": "2026-10-21T23:11",
      "end": "2026-10-21T23:13"
    },
    {
      "id": "8X-4.7",
      "kind": "task",
      "parent": "8X-4",
      "name": "Pings of a group or a party in several messages",
      "status": "done",
      "start": "2026-10-21T23:13",
      "end": "2026-10-21T23:14"
    },
    {
      "id": "8X-4.8",
      "kind": "task",
      "parent": "8X-4",
      "name": "The map's trains with power spot stops",
      "status": "done",
      "start": "2026-10-21T23:14",
      "end": "2026-10-21T23:16"
    },
    {
      "id": "8X-4.9",
      "kind": "task",
      "parent": "8X-4",
      "name": "Docs",
      "status": "done",
      "start": "2026-10-21T23:16",
      "end": "2026-10-21T23:18"
    },
    {
      "id": "8X-5",
      "kind": "plan",
      "parent": "15",
      "name": "8X-5 Max battles on the live map: the server side",
      "size": 1,
      "dependsOn": [
        "8X-3",
        "8X-4"
      ],
      "scope": "The map's data and routes for max battles (MapMax, /api/maxes, /api/powerspots, /api/max-options), Remote on the map, train kinds on the map; the page waits for the map's staging",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-21T23:45",
        "end": "2026-10-22T02:24",
        "review": {
          "start": "2026-10-22T01:07",
          "end": "2026-10-22T02:10"
        }
      },
      "review": {
        "start": "2026-10-22T02:35",
        "end": "2026-10-22T03:03"
      }
    },
    {
      "id": "8X-5.1",
      "kind": "task",
      "parent": "8X-5",
      "name": "reportMaxAs, shared by /max and the map",
      "status": "done",
      "start": "2026-10-22T02:24",
      "end": "2026-10-22T02:27"
    },
    {
      "id": "8X-5.2",
      "kind": "task",
      "parent": "8X-5",
      "name": "Max battles and Remote in the map's data",
      "status": "done",
      "start": "2026-10-22T02:27",
      "end": "2026-10-22T02:28"
    },
    {
      "id": "8X-5.3",
      "kind": "task",
      "parent": "8X-5",
      "name": "Power spots of a box, max pick lists",
      "status": "done",
      "start": "2026-10-22T02:28",
      "end": "2026-10-22T02:30"
    },
    {
      "id": "8X-5.4",
      "kind": "task",
      "parent": "8X-5",
      "name": "Reporting a max battle from the map",
      "status": "done",
      "start": "2026-10-22T02:30",
      "end": "2026-10-22T02:32"
    },
    {
      "id": "8X-5.5",
      "kind": "task",
      "parent": "8X-5",
      "name": "The Remote press on the map",
      "status": "done",
      "start": "2026-10-22T02:32",
      "end": "2026-10-22T02:33"
    },
    {
      "id": "8X-5.6",
      "kind": "task",
      "parent": "8X-5",
      "name": "Train kinds on the map",
      "status": "done",
      "start": "2026-10-22T02:33",
      "end": "2026-10-22T02:34"
    },
    {
      "id": "8X-5.7",
      "kind": "task",
      "parent": "8X-5",
      "name": "Docs",
      "status": "done",
      "start": "2026-10-22T02:34",
      "end": "2026-10-22T02:35"
    },
    {
      "id": "8X-6",
      "kind": "plan",
      "parent": "15",
      "name": "8X-6 /counters for max battles",
      "size": 0.5,
      "dependsOn": [
        "8X-2"
      ],
      "scope": "Pokebattler suggested max parties in /counters",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-21T07:19",
        "end": "2026-10-21T12:53",
        "review": {
          "start": "2026-10-21T11:13",
          "end": "2026-10-21T12:41"
        }
      },
      "review": {
        "start": "2026-10-21T13:00",
        "end": "2026-10-21T13:19"
      }
    },
    {
      "id": "8X-6.1",
      "kind": "task",
      "parent": "8X-6",
      "name": "Max battle teams from Pokebattler: roles and the answer",
      "status": "done",
      "start": "2026-10-21T12:53",
      "end": "2026-10-21T12:55"
    },
    {
      "id": "8X-6.2",
      "kind": "task",
      "parent": "8X-6",
      "name": "Max battle teams through the gateway",
      "status": "done",
      "start": "2026-10-21T12:55",
      "end": "2026-10-21T12:56"
    },
    {
      "id": "8X-6.3",
      "kind": "task",
      "parent": "8X-6",
      "name": "Counters for max battles, by role",
      "status": "done",
      "start": "2026-10-21T12:56",
      "end": "2026-10-21T12:57"
    },
    {
      "id": "8X-6.4",
      "kind": "task",
      "parent": "8X-6",
      "name": "The raid counters' link to the new site",
      "status": "done",
      "start": "2026-10-21T12:57",
      "end": "2026-10-21T12:58"
    },
    {
      "id": "8X-6.5",
      "kind": "task",
      "parent": "8X-6",
      "name": "Weather and friendship for max teams",
      "status": "done",
      "start": "2026-10-21T12:58",
      "end": "2026-10-21T12:59"
    },
    {
      "id": "8X-6.6",
      "kind": "task",
      "parent": "8X-6",
      "name": "Help, area files, announcements",
      "status": "done",
      "start": "2026-10-21T12:59",
      "end": "2026-10-21T12:59"
    },
    {
      "id": "8X-6.7",
      "kind": "task",
      "parent": "8X-6",
      "name": "The roles with a charger, in Pokebattler's words",
      "status": "done",
      "start": "2026-10-21T12:59",
      "end": "2026-10-21T13:00"
    },
    {
      "id": "8X-F",
      "kind": "plan",
      "parent": "15",
      "name": "8X-F Fixes from the 8X staging run",
      "size": 0.5,
      "dependsOn": [
        "8X-5"
      ],
      "scope": "Typed /route add on max trains, /max spot list, /boss tier, Meet… preselection, max events across restarts, words, DM Stop buttons last",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-22T11:26",
        "end": "2026-10-22T13:36",
        "review": {
          "start": "2026-10-22T12:38",
          "end": "2026-10-22T13:26"
        }
      },
      "review": {
        "start": "2026-10-22T13:44",
        "end": "2026-10-22T14:12"
      }
    },
    {
      "id": "8X-F.1",
      "kind": "task",
      "parent": "8X-F",
      "name": "Typed route add: a better fit of the other kind",
      "status": "done",
      "start": "2026-10-22T13:36",
      "end": "2026-10-22T13:38"
    },
    {
      "id": "8X-F.2",
      "kind": "task",
      "parent": "8X-F",
      "name": "Max spot: the region’s power spots before typing",
      "status": "done",
      "start": "2026-10-22T13:38",
      "end": "2026-10-22T13:39"
    },
    {
      "id": "8X-F.3",
      "kind": "task",
      "parent": "8X-F",
      "name": "Boss tier: for a max battle’s boss on no list",
      "status": "done",
      "start": "2026-10-22T13:39",
      "end": "2026-10-22T13:40"
    },
    {
      "id": "8X-F.4",
      "kind": "task",
      "parent": "8X-F",
      "name": "A per-open token in dialog ids",
      "status": "done",
      "start": "2026-10-22T13:40",
      "end": "2026-10-22T13:41"
    },
    {
      "id": "8X-F.5",
      "kind": "task",
      "parent": "8X-F",
      "name": "Max and big events in the database (migration 029)",
      "status": "done",
      "start": "2026-10-22T13:41",
      "end": "2026-10-22T13:41"
    },
    {
      "id": "8X-F.6",
      "kind": "task",
      "parent": "8X-F",
      "name": "Words of the 8X staging, endSentence",
      "status": "done",
      "start": "2026-10-22T13:41",
      "end": "2026-10-22T13:43"
    },
    {
      "id": "8X-F.7",
      "kind": "task",
      "parent": "8X-F",
      "name": "Notification DMs: Stop buttons last",
      "status": "done",
      "start": "2026-10-22T13:43",
      "end": "2026-10-22T13:44"
    },
    {
      "id": "8X-F.8",
      "kind": "task",
      "parent": "8X-F",
      "name": "Docs",
      "status": "done",
      "start": "2026-10-22T13:44",
      "end": "2026-10-22T13:44"
    },
    {
      "id": "8X-G",
      "kind": "plan",
      "parent": "15",
      "name": "8X-G The 8X-F staging and the design talk",
      "size": 0.75,
      "dependsOn": [
        "8X-F"
      ],
      "scope": "Pokebattler timeouts and Mew, small fixes, Move… and Manage… dialogs, … labels, groups in letter order, the summary post (Going on now, Passing through, Today at the stops)",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-22T19:15",
        "end": "2026-10-23T01:03",
        "review": {
          "start": "2026-10-22T22:13",
          "end": "2026-10-23T00:34"
        }
      },
      "review": {
        "start": "2026-10-23T01:19",
        "end": "2026-10-23T02:06"
      }
    },
    {
      "id": "8X-G.1",
      "kind": "task",
      "parent": "8X-G",
      "name": "Pokebattler: timeout, Mew, caching",
      "status": "done",
      "start": "2026-10-23T01:03",
      "end": "2026-10-23T01:07"
    },
    {
      "id": "8X-G.2",
      "kind": "task",
      "parent": "8X-G",
      "name": "Small fixes: start hint, dates, max events log",
      "status": "done",
      "start": "2026-10-23T01:07",
      "end": "2026-10-23T01:09"
    },
    {
      "id": "8X-G.3",
      "kind": "task",
      "parent": "8X-G",
      "name": "Labels with … and the train kind’s words",
      "status": "done",
      "start": "2026-10-23T01:09",
      "end": "2026-10-23T01:12"
    },
    {
      "id": "8X-G.4",
      "kind": "task",
      "parent": "8X-G",
      "name": "Groups in letter order",
      "status": "done",
      "start": "2026-10-23T01:12",
      "end": "2026-10-23T01:13"
    },
    {
      "id": "8X-G.5",
      "kind": "task",
      "parent": "8X-G",
      "name": "Dialogs with several choices, Move…",
      "status": "done",
      "start": "2026-10-23T01:13",
      "end": "2026-10-23T01:15"
    },
    {
      "id": "8X-G.6",
      "kind": "task",
      "parent": "8X-G",
      "name": "Manage…, the third row, the panel removed",
      "status": "done",
      "start": "2026-10-23T01:15",
      "end": "2026-10-23T01:17"
    },
    {
      "id": "8X-G.7",
      "kind": "task",
      "parent": "8X-G",
      "name": "The summary post: Going on now, Passing through, the stops line",
      "status": "done",
      "start": "2026-10-23T01:17",
      "end": "2026-10-23T01:18"
    },
    {
      "id": "8X-G.8",
      "kind": "task",
      "parent": "8X-G",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-23T01:18",
      "end": "2026-10-23T01:19"
    },
    {
      "id": "8X-H",
      "kind": "plan",
      "parent": "15",
      "name": "8X-H The 8X-G staging fixes",
      "size": 0.5,
      "dependsOn": [
        "8X-G"
      ],
      "scope": "Catch-up on reconnect, quieter outage logging, /counters movesets for Mew and the 503, Move… words, the summary date",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-23T11:19",
        "end": "2026-10-23T14:16",
        "review": {
          "start": "2026-10-23T12:37",
          "end": "2026-10-23T14:05"
        }
      },
      "review": {
        "start": "2026-10-23T15:08",
        "end": "2026-10-23T15:59"
      }
    },
    {
      "id": "8X-H.1",
      "kind": "task",
      "parent": "8X-H",
      "name": "Counters: shorter refusal, 503",
      "status": "done",
      "start": "2026-10-23T14:16",
      "end": "2026-10-23T15:00"
    },
    {
      "id": "8X-H.2",
      "kind": "task",
      "parent": "8X-H",
      "name": "Trains: Move… undo, finished route words",
      "status": "done",
      "start": "2026-10-23T15:00",
      "end": "2026-10-23T15:01"
    },
    {
      "id": "8X-H.3",
      "kind": "task",
      "parent": "8X-H",
      "name": "Summary: dates beyond a day",
      "status": "done",
      "start": "2026-10-23T15:01",
      "end": "2026-10-23T15:03"
    },
    {
      "id": "8X-H.4",
      "kind": "task",
      "parent": "8X-H",
      "name": "Logging: network warnings, success lines",
      "status": "done",
      "start": "2026-10-23T15:03",
      "end": "2026-10-23T15:05"
    },
    {
      "id": "8X-H.5",
      "kind": "task",
      "parent": "8X-H",
      "name": "Gateway watch",
      "status": "done",
      "start": "2026-10-23T15:05",
      "end": "2026-10-23T15:06"
    },
    {
      "id": "8X-H.6",
      "kind": "task",
      "parent": "8X-H",
      "name": "Catch-up on reconnect",
      "status": "done",
      "start": "2026-10-23T15:06",
      "end": "2026-10-23T15:07"
    },
    {
      "id": "8X-H.7",
      "kind": "task",
      "parent": "8X-H",
      "name": "Docs and staging checklist",
      "status": "done",
      "start": "2026-10-23T15:07",
      "end": "2026-10-23T15:08"
    },
    {
      "id": "8X-I",
      "kind": "plan",
      "parent": "15",
      "name": "8X-I /counters as Pokebattler builds teams",
      "size": 0.25,
      "dependsOn": [
        "8X-H"
      ],
      "after": [
        "8X-H"
      ],
      "scope": "The live run’s L1: Pokebattler’s four trainer roles (Matt, 2026-10-24), the link to its Lobby, each role’s words in small print, recorded Azelf teams",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-24T13:05",
        "end": "2026-10-24T14:19"
      },
      "review": {
        "start": "2026-10-24T13:51",
        "end": "2026-10-24T14:11"
      }
    },
    {
      "id": "8X-I.1",
      "kind": "task",
      "parent": "8X-I",
      "name": "The link to the Lobby and the role words",
      "status": "done",
      "start": "2026-10-24T13:38",
      "end": "2026-10-24T13:38"
    },
    {
      "id": "8X-I.2",
      "kind": "task",
      "parent": "8X-I",
      "name": "Pokebattler’s party definitions",
      "status": "done",
      "start": "2026-10-24T13:38",
      "end": "2026-10-24T13:51"
    },
    {
      "id": "8X-S",
      "kind": "plan",
      "parent": "15",
      "name": "8X-S Max battle screenshots",
      "size": 0.75,
      "dependsOn": [
        "8X-G"
      ],
      "scope": "Max battle screenshots on Discord: mentions, passive reading, /max screenshot:, a battle already at the spot, the moderators told of an unknown Power Spot, feedback and /read-screenshot; passive reading of another region; Power Spot capitalized",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-22T22:30",
        "end": "2026-10-23T06:58",
        "review": {
          "start": "2026-10-22T23:51",
          "end": "2026-10-23T06:56"
        }
      },
      "review": {
        "start": "2026-10-23T11:45",
        "end": "2026-10-23T13:20"
      }
    },
    {
      "id": "8X-S.1",
      "kind": "task",
      "parent": "8X-S",
      "name": "Passive reading of a gym in another region",
      "status": "done",
      "start": "2026-10-23T06:58",
      "end": "2026-10-23T11:30"
    },
    {
      "id": "8X-S.2",
      "kind": "task",
      "parent": "8X-S",
      "name": "The reading and the max report",
      "status": "done",
      "start": "2026-10-23T11:30",
      "end": "2026-10-23T11:32"
    },
    {
      "id": "8X-S.3",
      "kind": "task",
      "parent": "8X-S",
      "name": "Party state 15: bossSince and screenshot",
      "status": "done",
      "start": "2026-10-23T11:32",
      "end": "2026-10-23T11:33"
    },
    {
      "id": "8X-S.4",
      "kind": "task",
      "parent": "8X-S",
      "name": "A battle already at the spot",
      "status": "done",
      "start": "2026-10-23T11:33",
      "end": "2026-10-23T11:35"
    },
    {
      "id": "8X-S.5",
      "kind": "task",
      "parent": "8X-S",
      "name": "ScreenshotService's max path",
      "status": "done",
      "start": "2026-10-23T11:35",
      "end": "2026-10-23T11:37"
    },
    {
      "id": "8X-S.6",
      "kind": "task",
      "parent": "8X-S",
      "name": "Mentions, passive, the moderators’ note",
      "status": "done",
      "start": "2026-10-23T11:37",
      "end": "2026-10-23T11:40"
    },
    {
      "id": "8X-S.7",
      "kind": "task",
      "parent": "8X-S",
      "name": "/max screenshot:",
      "status": "done",
      "start": "2026-10-23T11:40",
      "end": "2026-10-23T11:42"
    },
    {
      "id": "8X-S.8",
      "kind": "task",
      "parent": "8X-S",
      "name": "/read-screenshot, feedback, ocr:review, docs",
      "status": "done",
      "start": "2026-10-23T11:42",
      "end": "2026-10-23T11:43"
    },
    {
      "id": "8X-S.9",
      "kind": "task",
      "parent": "8X-S",
      "name": "Power Spot capitalized",
      "status": "done",
      "start": "2026-10-23T11:43",
      "end": "2026-10-23T11:45"
    },
    {
      "id": "8X-J",
      "kind": "plan",
      "parent": "15",
      "name": "8X-J A boss at the wrong tier moved by one add",
      "size": 0.5,
      "dependsOn": [
        "8X-S"
      ],
      "after": [
        "8X-S"
      ],
      "scope": "The 8X-S staging’s Sneasel at 1★: an /admin boss add moves a boss within its group (Dynamax, plain or shadow raids), running battles too; screenshots that keep disagreeing with the list tell the moderators",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-25T19:53",
        "end": "2026-10-25T20:55"
      },
      "review": {
        "start": "2026-10-25T20:55",
        "end": "2026-10-25T22:00"
      }
    },
    {
      "id": "8X-J.1",
      "kind": "task",
      "parent": "8X-J",
      "name": "One rule moves a boss within its group",
      "status": "done",
      "start": "2026-10-25T20:16",
      "end": "2026-10-25T20:16"
    },
    {
      "id": "8X-J.2",
      "kind": "task",
      "parent": "8X-J",
      "name": "What staff see when they add and list",
      "status": "done",
      "start": "2026-10-25T20:16",
      "end": "2026-10-25T20:17"
    },
    {
      "id": "8X-J.3",
      "kind": "task",
      "parent": "8X-J",
      "name": "Running battles move with the add",
      "status": "done",
      "start": "2026-10-25T20:17",
      "end": "2026-10-25T20:31"
    },
    {
      "id": "8X-J.4",
      "kind": "task",
      "parent": "8X-J",
      "name": "Screenshots that disagree tell the moderators",
      "status": "done",
      "start": "2026-10-25T20:31",
      "end": "2026-10-25T20:55"
    },
    {
      "id": "17",
      "kind": "phase",
      "name": "Reports at stops",
      "dependsOn": [
        "8W-2"
      ],
      "scope": "Field research and Team GO Rocket reported at PokéStops: the pinned \"Today at the stops\" post, research and Rocket wants, stops of Pine's own, the map",
      "doneWhen": "Plans 8R-1 to 8R-3 merged"
    },
    {
      "id": "8R-D",
      "kind": "plan",
      "parent": "17",
      "name": "8R-D Reports at stops: brainstorm and design",
      "size": 0.3,
      "scope": "Brainstorm with Matt, the Leek Duck and ScrapedDuck feeds, design 2026-10-21-stop-reports-design.md, a fresh review, Matt's answers",
      "doneWhen": "Design approved by Matt",
      "planning": {
        "start": "2026-10-21T20:10",
        "end": "2026-10-21T21:35"
      },
      "status": "done"
    },
    {
      "id": "8R-1",
      "kind": "plan",
      "parent": "17",
      "name": "8R-1 Stops of Pine's own and field research",
      "size": 3,
      "dependsOn": [
        "8R-D"
      ],
      "scope": "/pokestop add|edit|remove, stop report storage, the task list from Leek Duck, research periods from the events feed, /research, the pinned post, the /want dialog of boxes, research wants and DMs",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-21T21:37",
        "end": "2026-10-22T02:37",
        "review": {
          "start": "2026-10-22T00:27",
          "end": "2026-10-22T02:21"
        }
      },
      "review": {
        "start": "2026-10-22T02:48",
        "end": "2026-10-22T03:53"
      }
    },
    {
      "id": "8R-1.1",
      "kind": "task",
      "parent": "8R-1",
      "name": "Reports at stops in the database, migration 027 (026 at first)",
      "status": "done",
      "start": "2026-10-22T02:37",
      "end": "2026-10-22T02:40"
    },
    {
      "id": "8R-1.2",
      "kind": "task",
      "parent": "8R-1",
      "name": "PokéStops of Pine's own, /pokestop",
      "status": "done",
      "start": "2026-10-22T02:40",
      "end": "2026-10-22T02:42"
    },
    {
      "id": "8R-1.3",
      "kind": "task",
      "parent": "8R-1",
      "name": "The field research task list from Leek Duck",
      "status": "done",
      "start": "2026-10-22T02:42",
      "end": "2026-10-22T02:43"
    },
    {
      "id": "8R-1.4",
      "kind": "task",
      "parent": "8R-1",
      "name": "Research periods from the events feed",
      "status": "done",
      "start": "2026-10-22T02:43",
      "end": "2026-10-22T02:44"
    },
    {
      "id": "8R-1.5",
      "kind": "task",
      "parent": "8R-1",
      "name": "The stop report service and /research",
      "status": "done",
      "start": "2026-10-22T02:44",
      "end": "2026-10-22T02:45"
    },
    {
      "id": "8R-1.6",
      "kind": "task",
      "parent": "8R-1",
      "name": "The pinned post Today at the stops",
      "status": "done",
      "start": "2026-10-22T02:45",
      "end": "2026-10-22T02:46"
    },
    {
      "id": "8R-1.7",
      "kind": "task",
      "parent": "8R-1",
      "name": "The /want dialog of boxes, TargetWant, max battles by their boxes",
      "status": "done",
      "start": "2026-10-22T02:46",
      "end": "2026-10-22T02:47"
    },
    {
      "id": "8R-1.8",
      "kind": "task",
      "parent": "8R-1",
      "name": "Research wants and their DMs",
      "status": "done",
      "start": "2026-10-22T02:47",
      "end": "2026-10-22T02:48"
    },
    {
      "id": "8R-1.9",
      "kind": "task",
      "parent": "8R-1",
      "name": "Docs: stop reports, the want dialog, Pine stops, guides",
      "status": "done",
      "start": "2026-10-22T02:48",
      "end": "2026-10-22T02:48"
    },
    {
      "id": "8R-2",
      "kind": "plan",
      "parent": "17",
      "name": "8R-2 Team GO Rocket reports",
      "size": 2,
      "dependsOn": [
        "8R-1"
      ],
      "scope": "Rocket lineups from ScrapedDuck, /rocket, grunt messages, hideouts in the pinned post, Rocket wants",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-22T04:00",
        "end": "2026-10-22T06:42",
        "review": {
          "start": "2026-10-22T05:15",
          "end": "2026-10-22T06:31"
        }
      },
      "review": {
        "start": "2026-10-22T06:52",
        "end": "2026-10-22T07:20"
      }
    },
    {
      "id": "8R-2.1",
      "kind": "task",
      "parent": "8R-2",
      "name": "Rocket lineups and their storage, migration 028",
      "status": "done",
      "start": "2026-10-22T06:42",
      "end": "2026-10-22T06:44"
    },
    {
      "id": "8R-2.2",
      "kind": "task",
      "parent": "8R-2",
      "name": "The Rocket lineups read from ScrapedDuck, settings.rocket",
      "status": "done",
      "start": "2026-10-22T06:44",
      "end": "2026-10-22T06:45"
    },
    {
      "id": "8R-2.3",
      "kind": "task",
      "parent": "8R-2",
      "name": "Rocket reports at stops, one per stop and day",
      "status": "done",
      "start": "2026-10-22T06:45",
      "end": "2026-10-22T06:46"
    },
    {
      "id": "8R-2.4",
      "kind": "task",
      "parent": "8R-2",
      "name": "Grunts' messages in the region channels",
      "status": "done",
      "start": "2026-10-22T06:46",
      "end": "2026-10-22T06:47"
    },
    {
      "id": "8R-2.5",
      "kind": "task",
      "parent": "8R-2",
      "name": "/rocket report and /rocket remove, the hideout dialog",
      "status": "done",
      "start": "2026-10-22T06:47",
      "end": "2026-10-22T06:48"
    },
    {
      "id": "8R-2.6",
      "kind": "task",
      "parent": "8R-2",
      "name": "The hideouts in the pinned post",
      "status": "done",
      "start": "2026-10-22T06:48",
      "end": "2026-10-22T06:49"
    },
    {
      "id": "8R-2.7",
      "kind": "task",
      "parent": "8R-2",
      "name": "Rocket wants in /want, /wants and /unwant",
      "status": "done",
      "start": "2026-10-22T06:49",
      "end": "2026-10-22T06:49"
    },
    {
      "id": "8R-2.8",
      "kind": "task",
      "parent": "8R-2",
      "name": "Direct messages of Team GO Rocket",
      "status": "done",
      "start": "2026-10-22T06:49",
      "end": "2026-10-22T06:50"
    },
    {
      "id": "8R-2.9",
      "kind": "task",
      "parent": "8R-2",
      "name": "Docs: Team GO Rocket at stops, Rocket wants, guides",
      "status": "done",
      "start": "2026-10-22T06:50",
      "end": "2026-10-22T06:52"
    },
    {
      "id": "8R-3",
      "kind": "plan",
      "parent": "17",
      "name": "8R-3 Reports at stops on the live map, the server side",
      "size": 1.5,
      "dependsOn": [
        "8R-1",
        "8R-2"
      ],
      "scope": "The server side only (Matt, 2026-10-22, as 8X-5): /research's and /rocket's reports as code paths shared with the map, today's reports as the map's data, the pick lists, reporting and taking back from the map; the page waits for the map's UX pass",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-22T07:28",
        "end": "2026-10-22T11:20",
        "review": {
          "start": "2026-10-22T10:04",
          "end": "2026-10-22T11:12"
        }
      },
      "review": {
        "start": "2026-10-22T11:25",
        "end": "2026-10-22T11:45"
      }
    },
    {
      "id": "8R-3.1",
      "kind": "task",
      "parent": "8R-3",
      "name": "Shared code paths of /research and /rocket",
      "status": "done",
      "start": "2026-10-22T11:20",
      "end": "2026-10-22T11:21"
    },
    {
      "id": "8R-3.2",
      "kind": "task",
      "parent": "8R-3",
      "name": "The reports' view on the map and who sees it",
      "status": "done",
      "start": "2026-10-22T11:21",
      "end": "2026-10-22T11:23"
    },
    {
      "id": "8R-3.3",
      "kind": "task",
      "parent": "8R-3",
      "name": "The pick lists and the stops of Pine on the map",
      "status": "done",
      "start": "2026-10-22T11:23",
      "end": "2026-10-22T11:24"
    },
    {
      "id": "8R-3.4",
      "kind": "task",
      "parent": "8R-3",
      "name": "Reporting and taking back from the map",
      "status": "done",
      "start": "2026-10-22T11:24",
      "end": "2026-10-22T11:25"
    },
    {
      "id": "8R-3.5",
      "kind": "task",
      "parent": "8R-3",
      "name": "Docs: reports at stops on the map, the UX pass",
      "status": "done",
      "start": "2026-10-22T11:25",
      "end": "2026-10-22T11:25"
    },
    {
      "id": "8R-4",
      "kind": "plan",
      "parent": "17",
      "name": "8R-4 Want enhancements",
      "size": 1,
      "dependsOn": [
        "8R-1"
      ],
      "after": [
        "8R-3"
      ],
      "scope": "Costumed wants (any costume; a plain want covers them), which forms in the dialog, megas raid-only, Change… on DMs and /wants with Remove, /wants sorted, one Team GO Rocket dialog; costumed raids, research and event spawns; migration 030, game data 7",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-22T12:07",
        "end": "2026-10-22T20:30",
        "review": {
          "start": "2026-10-22T17:19",
          "end": "2026-10-22T20:07"
        }
      },
      "review": {
        "start": "2026-10-22T20:42",
        "end": "2026-10-22T21:23"
      }
    },
    {
      "id": "8R-4.1",
      "kind": "task",
      "parent": "8R-4",
      "name": "Costumes in the game data (version 7), costumes known by name",
      "status": "done",
      "start": "2026-10-22T20:30",
      "end": "2026-10-22T20:32"
    },
    {
      "id": "8R-4.2",
      "kind": "task",
      "parent": "8R-4",
      "name": "Costumed wants and matching, migration 030",
      "status": "done",
      "start": "2026-10-22T20:32",
      "end": "2026-10-22T20:34"
    },
    {
      "id": "8R-4.3",
      "kind": "task",
      "parent": "8R-4",
      "name": "One answer per species: storage and the dialog id",
      "status": "done",
      "start": "2026-10-22T20:34",
      "end": "2026-10-22T20:35"
    },
    {
      "id": "8R-4.4",
      "kind": "task",
      "parent": "8R-4",
      "name": "The Pokémon dialog: Which, Costumes, Remove",
      "status": "done",
      "start": "2026-10-22T20:35",
      "end": "2026-10-22T20:36"
    },
    {
      "id": "8R-4.5",
      "kind": "task",
      "parent": "8R-4",
      "name": "Change… on DMs",
      "status": "done",
      "start": "2026-10-22T20:36",
      "end": "2026-10-22T20:38"
    },
    {
      "id": "8R-4.6",
      "kind": "task",
      "parent": "8R-4",
      "name": "/wants: Change…, order, counts",
      "status": "done",
      "start": "2026-10-22T20:38",
      "end": "2026-10-22T20:39"
    },
    {
      "id": "8R-4.7",
      "kind": "task",
      "parent": "8R-4",
      "name": "The Team GO Rocket dialog",
      "status": "done",
      "start": "2026-10-22T20:39",
      "end": "2026-10-22T20:40"
    },
    {
      "id": "8R-4.8",
      "kind": "task",
      "parent": "8R-4",
      "name": "Costumed spawns from active events",
      "status": "done",
      "start": "2026-10-22T20:40",
      "end": "2026-10-22T20:42"
    },
    {
      "id": "8R-4L",
      "kind": "plan",
      "parent": "17",
      "name": "8R-4L Grunt lineups reported apart",
      "size": 1,
      "dependsOn": [
        "8R-2"
      ],
      "after": [
        "8R-4"
      ],
      "scope": "A grunt type with two lineups (the feed's male and female, e.g. the Magikarp water grunt) reported per lineup, named by its first slot, plus 'not sure which'; wants stay by type, a catch fires on its lineup only (design 2026-10-22-costume-form-wants-design.md, 4b and S5–S11). Split from 8R-4 (Matt, 2026-10-22)",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-22T22:00",
        "end": "2026-10-23T02:04",
        "review": {
          "start": "2026-10-22T23:12",
          "end": "2026-10-23T01:41"
        }
      },
      "review": {
        "start": "2026-10-23T02:13",
        "end": "2026-10-23T02:37"
      }
    },
    {
      "id": "8R-4L.1",
      "kind": "task",
      "parent": "8R-4L",
      "name": "Grunt lineups in the domain",
      "status": "done",
      "start": "2026-10-23T02:04",
      "end": "2026-10-23T02:06"
    },
    {
      "id": "8R-4L.2",
      "kind": "task",
      "parent": "8R-4L",
      "name": "Lineups and in-place reports in storage",
      "status": "done",
      "start": "2026-10-23T02:06",
      "end": "2026-10-23T02:07"
    },
    {
      "id": "8R-4L.3",
      "kind": "task",
      "parent": "8R-4L",
      "name": "Reporting one lineup with the rocket command",
      "status": "done",
      "start": "2026-10-23T02:07",
      "end": "2026-10-23T02:08"
    },
    {
      "id": "8R-4L.4",
      "kind": "task",
      "parent": "8R-4L",
      "name": "A lineup refines its grunt in place",
      "status": "done",
      "start": "2026-10-23T02:08",
      "end": "2026-10-23T02:10"
    },
    {
      "id": "8R-4L.5",
      "kind": "task",
      "parent": "8R-4L",
      "name": "The notifier by grunt type",
      "status": "done",
      "start": "2026-10-23T02:10",
      "end": "2026-10-23T02:11"
    },
    {
      "id": "8R-4L.6",
      "kind": "task",
      "parent": "8R-4L",
      "name": "Grunt lineups on the map's server side",
      "status": "done",
      "start": "2026-10-23T02:11",
      "end": "2026-10-23T02:12"
    },
    {
      "id": "8R-4L.7",
      "kind": "task",
      "parent": "8R-4L",
      "name": "Docs for grunt lineups",
      "status": "done",
      "start": "2026-10-23T02:12",
      "end": "2026-10-23T02:13"
    },
    {
      "id": "8R-5",
      "kind": "plan",
      "parent": "17",
      "name": "8R-5 Research rewards reported apart",
      "size": 1,
      "dependsOn": [
        "8R-1"
      ],
      "after": [
        "8R-4L"
      ],
      "scope": "A task's possible rewards are versions of their own, reported one by one, plus 'one of' its encounters before the task is done; narrowing, Already reported, and a dialog of unticked stops before any contradiction; a confirmation DM on narrowing (design 2026-10-23-research-rewards-apart-design.md; Matt, 2026-10-23)",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-23T04:54",
        "end": "2026-10-23T09:55",
        "review": {
          "start": "2026-10-23T05:56",
          "end": "2026-10-23T09:37"
        }
      },
      "review": {
        "start": "2026-10-23T10:04",
        "end": "2026-10-23T10:43"
      }
    },
    {
      "id": "8R-5.1",
      "kind": "task",
      "parent": "8R-5",
      "name": "Research versions and decisions in the domain",
      "status": "done",
      "start": "2026-10-23T09:55",
      "end": "2026-10-23T09:58"
    },
    {
      "id": "8R-5.2",
      "kind": "task",
      "parent": "8R-5",
      "name": "Versions in the task list and reports in storage",
      "status": "done",
      "start": "2026-10-23T09:58",
      "end": "2026-10-23T09:59"
    },
    {
      "id": "8R-5.3",
      "kind": "task",
      "parent": "8R-5",
      "name": "Reporting one version with the research command",
      "status": "done",
      "start": "2026-10-23T09:59",
      "end": "2026-10-23T10:01"
    },
    {
      "id": "8R-5.4",
      "kind": "task",
      "parent": "8R-5",
      "name": "The notifier: confirmations and narrowed one-ofs",
      "status": "done",
      "start": "2026-10-23T10:01",
      "end": "2026-10-23T10:02"
    },
    {
      "id": "8R-5.5",
      "kind": "task",
      "parent": "8R-5",
      "name": "The pinned post by task and version",
      "status": "done",
      "start": "2026-10-23T10:02",
      "end": "2026-10-23T10:03"
    },
    {
      "id": "8R-5.6",
      "kind": "task",
      "parent": "8R-5",
      "name": "Research versions on the map's server side",
      "status": "done",
      "start": "2026-10-23T10:03",
      "end": "2026-10-23T10:04"
    },
    {
      "id": "8R-5.7",
      "kind": "task",
      "parent": "8R-5",
      "name": "Docs for research versions",
      "status": "done",
      "start": "2026-10-23T10:04",
      "end": "2026-10-23T10:04"
    },
    {
      "id": "8R-6",
      "kind": "plan",
      "parent": "17",
      "name": "8R-6 Pictures at the stops",
      "size": 1,
      "dependsOn": [
        "8R-5"
      ],
      "after": [
        "8R-5"
      ],
      "scope": "Padded square pictures served by the web server, a picture per reward line, the encounter picture while a Pokémon is not known, leaders' portraits, one picture on a grunt message; the 8R staging's small fixes, Already reported not counted (design 2026-10-23-stop-pictures-design.md; Matt, 2026-10-23)",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-23T23:31",
        "end": "2026-10-24T03:30",
        "review": {
          "start": "2026-10-24T00:37",
          "end": "2026-10-24T03:27"
        }
      },
      "review": {
        "start": "2026-10-24T03:41",
        "end": "2026-10-24T09:07"
      }
    },
    {
      "id": "8R-6.1",
      "kind": "task",
      "parent": "8R-6",
      "name": "The picture rule in the domain",
      "status": "done",
      "start": "2026-10-24T03:30",
      "end": "2026-10-24T03:33"
    },
    {
      "id": "8R-6.2",
      "kind": "task",
      "parent": "8R-6",
      "name": "StopPictures and its route",
      "status": "done",
      "start": "2026-10-24T03:33",
      "end": "2026-10-24T03:35"
    },
    {
      "id": "8R-6.3",
      "kind": "task",
      "parent": "8R-6",
      "name": "Pictures in the post Today at the stops",
      "status": "done",
      "start": "2026-10-24T03:35",
      "end": "2026-10-24T03:36"
    },
    {
      "id": "8R-6.4",
      "kind": "task",
      "parent": "8R-6",
      "name": "Pictures in DMs and the grunt message",
      "status": "done",
      "start": "2026-10-24T03:36",
      "end": "2026-10-24T03:37"
    },
    {
      "id": "8R-6.5",
      "kind": "task",
      "parent": "8R-6",
      "name": "Portraits on the map",
      "status": "done",
      "start": "2026-10-24T03:37",
      "end": "2026-10-24T03:38"
    },
    {
      "id": "8R-6.6",
      "kind": "task",
      "parent": "8R-6",
      "name": "Small fixes from the 8R staging",
      "status": "done",
      "start": "2026-10-24T03:38",
      "end": "2026-10-24T03:40"
    },
    {
      "id": "8R-6.7",
      "kind": "task",
      "parent": "8R-6",
      "name": "Already reported not counted",
      "status": "done",
      "start": "2026-10-24T03:40",
      "end": "2026-10-24T03:41"
    },
    {
      "id": "8R-6.8",
      "kind": "task",
      "parent": "8R-6",
      "name": "Docs for pictures at the stops",
      "status": "done",
      "start": "2026-10-24T03:41",
      "end": "2026-10-24T03:41"
    },
    {
      "id": "8R-7",
      "kind": "plan",
      "parent": "17",
      "name": "8R-7 Everyone’s events, a map link per stop",
      "size": 1,
      "dependsOn": [
        "8R-6"
      ],
      "after": [
        "8R-6"
      ],
      "scope": "F1 of the 8R-6 staging: one rule for everyone’s events in every feed reader (an allow list for research events, the City Safari and city editions left out); E1: the stop’s name a link to its place in the post and the research and Rocket DMs (Matt, 2026-10-24)",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-24T11:10",
        "end": "2026-10-24T12:22",
        "review": {
          "start": "2026-10-24T11:57",
          "end": "2026-10-24T12:13"
        }
      },
      "review": {
        "start": "2026-10-24T12:26",
        "end": "2026-10-24T12:54"
      }
    },
    {
      "id": "8R-7.1",
      "kind": "task",
      "parent": "8R-7",
      "name": "Everyone’s events in every feed reader",
      "status": "done",
      "start": "2026-10-24T12:22",
      "end": "2026-10-24T12:25"
    },
    {
      "id": "8R-7.2",
      "kind": "task",
      "parent": "8R-7",
      "name": "Each stop’s name a link to its place",
      "status": "done",
      "start": "2026-10-24T12:25",
      "end": "2026-10-24T12:26"
    },
    {
      "id": "8R-8",
      "kind": "plan",
      "parent": "17",
      "name": "8R-8 An event’s research tasks first",
      "size": 0.25,
      "dependsOn": [
        "8R-7"
      ],
      "after": [
        "8R-7"
      ],
      "scope": "An event’s tasks (any heading but the standing ones on Leek Duck’s research page) first in every pick list and in Today’s Stops; the confirmation DM’s stops link to their place (Matt, 2026-10-25)",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-25T12:42",
        "end": "2026-10-25T13:40"
      },
      "review": {
        "start": "2026-10-25T13:21",
        "end": "2026-10-25T13:34"
      }
    },
    {
      "id": "8R-8.1",
      "kind": "task",
      "parent": "8R-8",
      "name": "An event’s tasks first in the task list",
      "status": "done",
      "start": "2026-10-25T13:14",
      "end": "2026-10-25T13:14"
    },
    {
      "id": "8R-8.2",
      "kind": "task",
      "parent": "8R-8",
      "name": "An event’s tasks first in Today’s Stops",
      "status": "done",
      "start": "2026-10-25T13:14",
      "end": "2026-10-25T13:16"
    },
    {
      "id": "8R-8.3",
      "kind": "task",
      "parent": "8R-8",
      "name": "The confirmation DM’s map links",
      "status": "done",
      "start": "2026-10-25T13:16",
      "end": "2026-10-25T13:20"
    },
    {
      "id": "8R-9",
      "kind": "plan",
      "parent": "17",
      "name": "8R-9 The region’s board",
      "size": 1,
      "dependsOn": [
        "8R-8"
      ],
      "after": [
        "8R-8"
      ],
      "scope": "The forum <channel>-board, its locked pinned post “Today and coming up” (Today, then one Coming up list) with “Today’s Stops” under it, a text-channel line per new task, leader and Giovanni; migration 031",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-25T19:53",
        "end": "2026-10-26T00:07",
        "review": {
          "start": "2026-10-25T22:13",
          "end": "2026-10-25T23:53"
        }
      },
      "review": {
        "start": "2026-10-26T00:18",
        "end": "2026-10-26T01:05"
      }
    },
    {
      "id": "8R-9.1",
      "kind": "task",
      "parent": "8R-9",
      "name": "Today’s Stops in the board",
      "status": "done",
      "start": "2026-10-26T00:07",
      "end": "2026-10-26T00:11"
    },
    {
      "id": "8R-9.2",
      "kind": "task",
      "parent": "8R-9",
      "name": "The summary: Today and coming up, locked",
      "status": "done",
      "start": "2026-10-26T00:11",
      "end": "2026-10-26T00:13"
    },
    {
      "id": "8R-9.3",
      "kind": "task",
      "parent": "8R-9",
      "name": "A line per new task and leader",
      "status": "done",
      "start": "2026-10-26T00:13",
      "end": "2026-10-26T00:16"
    },
    {
      "id": "8R-9.4",
      "kind": "task",
      "parent": "8R-9",
      "name": "Words, permissions and docs",
      "status": "done",
      "start": "2026-10-26T00:16",
      "end": "2026-10-26T00:18"
    },
    {
      "id": "8R-9F",
      "kind": "plan",
      "parent": "17",
      "name": "8R-9F The board takes commands",
      "size": 1,
      "dependsOn": [
        "8R-9"
      ],
      "after": [
        "8R-9"
      ],
      "scope": "The board post unlocked (once, 6 h slowmode) and kept tidy: members’ messages deleted with a daily DM, board screenshots read and answered by DM; the stops’ cap 3 to 10; Coming up names a kind once; the line kept when the board was deleted",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-27T04:35",
        "end": "2026-10-27T06:49",
        "review": {
          "start": "2026-10-27T05:47",
          "end": "2026-10-27T06:29"
        }
      },
      "review": {
        "start": "2026-10-27T07:00",
        "end": "2026-10-27T07:42"
      }
    },
    {
      "id": "8R-9F.1",
      "kind": "task",
      "parent": "8R-9F",
      "name": "The board unlocked and kept tidy",
      "status": "done",
      "start": "2026-10-27T06:49",
      "end": "2026-10-27T06:54"
    },
    {
      "id": "8R-9F.2",
      "kind": "task",
      "parent": "8R-9F",
      "name": "Screenshots in the board",
      "status": "done",
      "start": "2026-10-27T06:54",
      "end": "2026-10-27T06:57"
    },
    {
      "id": "8R-9F.3",
      "kind": "task",
      "parent": "8R-9F",
      "name": "The stops’ cap, M1 and M2",
      "status": "done",
      "start": "2026-10-27T06:57",
      "end": "2026-10-27T06:59"
    },
    {
      "id": "8R-9F.4",
      "kind": "task",
      "parent": "8R-9F",
      "name": "Words and docs",
      "status": "done",
      "start": "2026-10-27T06:59",
      "end": "2026-10-27T07:00"
    },
    {
      "id": "8R-9G",
      "kind": "plan",
      "parent": "17",
      "name": "8R-9G Reactions off the board",
      "size": 1,
      "dependsOn": [
        "8R-9F"
      ],
      "after": [
        "8R-9F"
      ],
      "scope": "Pine removes reactions on its own board messages at each edit and at the sweep (start, reconnect); party posts keep theirs",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-27T08:42",
        "end": "2026-10-27T09:31"
      },
      "review": {
        "start": "2026-10-27T09:02",
        "end": "2026-10-27T09:13"
      }
    },
    {
      "id": "8R-9G.1",
      "kind": "task",
      "parent": "8R-9G",
      "name": "Reactions removed on edit and sweep",
      "status": "done",
      "start": "2026-10-27T09:02",
      "end": "2026-10-27T09:02"
    },
    {
      "id": "8R-9H",
      "kind": "plan",
      "parent": "17",
      "name": "8R-9H The board mark as 45 s of slowmode",
      "size": 0.5,
      "dependsOn": [
        "8R-9G"
      ],
      "after": [
        "8R-9G"
      ],
      "scope": "The board slowmode mark becomes 45 seconds (a value the Discord menu lacks); a board with the old 6 hours is moved at the next draw, a lock kept",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-27T14:08",
        "end": "2026-10-27T14:39",
        "review": {
          "start": "2026-10-27T14:43",
          "end": "2026-10-27T14:53"
        }
      },
      "review": {
        "start": "2026-10-27T14:43",
        "end": "2026-10-27T14:53"
      }
    },
    {
      "id": "8R-9H.1",
      "kind": "task",
      "parent": "8R-9H",
      "name": "The 45-second mark and the old mark moved",
      "status": "done",
      "start": "2026-10-27T14:39",
      "end": "2026-10-27T14:43"
    },
    {
      "id": "8B-L",
      "kind": "plan",
      "parent": "8",
      "name": "8B-L Raid bosses from the Leek Duck raid manifest",
      "size": 1,
      "dependsOn": [
        "8R-9H"
      ],
      "after": [
        "8R-9H"
      ],
      "scope": "Staging finding B1: the raid boss list read from the Leek Duck rotations in force (raids/manifest.json and each rotation), read again at the next local boundary; ScrapedDuck as the fallback",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-27T14:08",
        "end": "2026-10-27T14:39",
        "review": {
          "start": "2026-10-27T15:11",
          "end": "2026-10-27T15:11"
        }
      },
      "review": {
        "start": "2026-10-27T15:36",
        "end": "2026-10-27T15:36"
      }
    },
    {
      "id": "8B-L.1",
      "kind": "task",
      "parent": "8B-L",
      "name": "Manifest, rotations and the boundary read",
      "status": "done",
      "start": "2026-10-27T14:39",
      "end": "2026-10-27T15:36"
    },
    {
      "id": "8Y",
      "kind": "plan",
      "parent": "8",
      "name": "8Y Temporal in place of Luxon",
      "size": 1,
      "dependsOn": [
        "8B-L"
      ],
      "after": [
        "8B-L"
      ],
      "scope": "Node 26 has Temporal built in: every zoned time through src/domain/time/zoned.ts, luxon and @types/luxon removed, lint refuses Luxon and Temporal.Now",
      "doneWhen": "Merged into typescript-migration",
      "status": "done",
      "planning": {
        "start": "2026-10-28T16:00",
        "end": "2026-10-28T16:25"
      },
      "review": {
        "start": "2026-10-28T19:04",
        "end": "2026-10-28T20:03"
      }
    },
    {
      "id": "8Y.1",
      "kind": "task",
      "parent": "8Y",
      "name": "The helper zoned.ts and its tests",
      "status": "done",
      "start": "2026-10-28T16:25",
      "end": "2026-10-28T16:33"
    },
    {
      "id": "8Y.2",
      "kind": "task",
      "parent": "8Y",
      "name": "src/domain/time on Temporal",
      "status": "done",
      "start": "2026-10-28T16:33",
      "end": "2026-10-28T16:40"
    },
    {
      "id": "8Y.3",
      "kind": "task",
      "parent": "8Y",
      "name": "The rest of src/domain",
      "status": "done",
      "start": "2026-10-28T16:40",
      "end": "2026-10-28T16:45"
    },
    {
      "id": "8Y.4",
      "kind": "task",
      "parent": "8Y",
      "name": "Render, commands, services and scripts",
      "status": "done",
      "start": "2026-10-28T16:45",
      "end": "2026-10-28T16:50"
    },
    {
      "id": "8Y.5",
      "kind": "task",
      "parent": "8Y",
      "name": "The tests build their times without Luxon",
      "status": "done",
      "start": "2026-10-28T16:50",
      "end": "2026-10-28T18:58"
    },
    {
      "id": "8Y.6",
      "kind": "task",
      "parent": "8Y",
      "name": "Luxon removed, lint guards, docs",
      "status": "done",
      "start": "2026-10-28T18:58",
      "end": "2026-10-28T19:04"
    },
    {
      "id": "18",
      "kind": "phase",
      "name": "Events forum",
      "scope": "A forum per server listing the game’s events from ScrapedDuck, a post per bigger event, Campfire links"
    },
    {
      "id": "8V-1",
      "kind": "plan",
      "parent": "18",
      "name": "8V-1 The events forum and Campfire links",
      "status": "done",
      "size": 0.6,
      "dependsOn": [],
      "scope": "Campfire links (help, the web list’s foot line, a no-fetch guard); the events forum: one pinned listing Now / This week / Coming up, a post per bigger event, kept events (migration 033), setup-forums, cutover-check",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-29T03:22",
        "end": "2026-10-29T06:49",
        "review": {
          "start": "2026-10-29T05:49",
          "end": "2026-10-29T06:42"
        }
      },
      "review": {
        "start": "2026-10-29T06:58",
        "end": "2026-10-29T08:02"
      }
    },
    {
      "id": "8V-1.1",
      "kind": "task",
      "parent": "8V-1",
      "name": "Campfire links, never fetched",
      "status": "done",
      "start": "2026-10-29T06:49",
      "end": "2026-10-29T06:52"
    },
    {
      "id": "8V-1.2",
      "kind": "task",
      "parent": "8V-1",
      "name": "The events listing's domain and data",
      "status": "done",
      "start": "2026-10-29T06:52",
      "end": "2026-10-29T06:54"
    },
    {
      "id": "8V-1.3",
      "kind": "task",
      "parent": "8V-1",
      "name": "The events forum's settings, setup and gateway",
      "status": "done",
      "start": "2026-10-29T06:54",
      "end": "2026-10-29T06:56"
    },
    {
      "id": "8V-1.4",
      "kind": "task",
      "parent": "8V-1",
      "name": "EventForumService: the listing and the event posts",
      "status": "done",
      "start": "2026-10-29T06:56",
      "end": "2026-10-29T06:57"
    },
    {
      "id": "8V-1.5",
      "kind": "task",
      "parent": "8V-1",
      "name": "Docs and the staging checklist",
      "status": "done",
      "start": "2026-10-29T06:57",
      "end": "2026-10-29T06:58"
    },
    {
      "id": "16",
      "kind": "phase",
      "name": "Cutover",
      "size": 2,
      "dependsOn": [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
        "12",
        "13",
        "14"
      ],
      "scope": "Cutover to the new bot, legacy channel migration, legacy JS removed",
      "doneWhen": "Production runs on the new bot; legacy JS removed"
    },
    {
      "id": "8P",
      "kind": "plan",
      "parent": "16",
      "name": "8P Planning the cutover with Matt",
      "status": "done",
      "size": 0.2,
      "dependsOn": [
        "7F"
      ],
      "scope": "The order of Phase 8, no import of legacy parties, Phase 9 before the cutover, a guide for other instances; the production host looked at over SSH and its dumps checked"
    },
    {
      "id": "8P.1",
      "kind": "task",
      "parent": "8P",
      "name": "Decisions for Phase 8; the production host and its backups",
      "status": "done",
      "start": "2026-10-15T00:40",
      "end": "2026-10-15T01:10"
    },
    {
      "id": "8P.2",
      "kind": "task",
      "parent": "8P",
      "name": "Drafts of the posts and the command names with Matt; samples on the test server",
      "status": "done",
      "start": "2026-10-15T01:10",
      "end": "2026-10-15T02:00"
    },
    {
      "id": "8P-2",
      "kind": "plan",
      "parent": "16",
      "name": "8P-2 Designing the cutover, the Docker stack and the party history",
      "status": "done",
      "size": 0.2,
      "dependsOn": [
        "8B-4"
      ],
      "scope": "The questions with Matt, the design (docs/superpowers/specs/2026-10-16-cutover-docker-history-design.md), a builder check"
    },
    {
      "id": "8P-2.1",
      "kind": "task",
      "parent": "8P-2",
      "name": "Questions with Matt; the design and its builder check",
      "status": "done",
      "start": "2026-10-15T23:40",
      "end": "2026-10-16T01:30"
    },
    {
      "id": "8L-1",
      "kind": "plan",
      "parent": "16",
      "name": "8L-1 Legacy Pine without privileged intents",
      "status": "done",
      "size": 0.1,
      "dependsOn": [
        "8P-2"
      ],
      "scope": "A patch on the local branch legacy: legacy Pine starts and connects without Server Members and Presence"
    },
    {
      "id": "8L-1.1",
      "kind": "task",
      "parent": "8L-1",
      "name": "The intents and the guards for uncached members",
      "status": "done",
      "start": "2026-10-16T01:30",
      "end": "2026-10-16T01:45"
    },
    {
      "id": "8C",
      "kind": "plan",
      "parent": "16",
      "name": "8C Cutover tools: check, settings converter, rehearsal mode, legacy cleanup, runbook",
      "size": 1,
      "dependsOn": [
        "9A"
      ],
      "scope": "cutover:check, the converter of legacy settings, rehearsal mode, /admin cleanup-legacy (orphans too), the runbook of the night",
      "planning": {
        "start": "2026-10-16T01:05",
        "end": "2026-10-16T12:04",
        "review": {
          "start": "2026-10-16T06:12",
          "end": "2026-10-16T11:33"
        }
      },
      "status": "done",
      "review": {
        "start": "2026-10-16T12:14",
        "end": "2026-10-16T13:20"
      }
    },
    {
      "id": "8C.1",
      "kind": "task",
      "parent": "8C",
      "name": "emoji-upload and role-auth-export as CLIs",
      "status": "done",
      "start": "2026-10-16T12:04",
      "end": "2026-10-16T12:06"
    },
    {
      "id": "8C.2",
      "kind": "task",
      "parent": "8C",
      "name": "The settings converter",
      "status": "done",
      "start": "2026-10-16T12:06",
      "end": "2026-10-16T12:08"
    },
    {
      "id": "8C.3",
      "kind": "task",
      "parent": "8C",
      "name": "cutover-check",
      "status": "done",
      "start": "2026-10-16T12:08",
      "end": "2026-10-16T12:10"
    },
    {
      "id": "8C.4",
      "kind": "task",
      "parent": "8C",
      "name": "Rehearsal mode",
      "status": "done",
      "start": "2026-10-16T12:10",
      "end": "2026-10-16T12:12"
    },
    {
      "id": "8C.5",
      "kind": "task",
      "parent": "8C",
      "name": "The legacy cleanup",
      "status": "done",
      "start": "2026-10-16T12:12",
      "end": "2026-10-16T12:13"
    },
    {
      "id": "8C.6",
      "kind": "task",
      "parent": "8C",
      "name": "The runbook",
      "status": "done",
      "start": "2026-10-16T12:13",
      "end": "2026-10-16T12:14"
    },
    {
      "id": "8L-2",
      "kind": "plan",
      "parent": "16",
      "name": "8L-2 Guides, README, the announcement draft",
      "status": "done",
      "size": 0.5,
      "dependsOn": [
        "8H"
      ],
      "scope": "Migration guide for legacy instances, guide for a new instance, README pointer, the #bot-updates post",
      "planning": {
        "start": "2026-10-16T18:40",
        "end": "2026-10-16T18:54"
      },
      "review": {
        "start": "2026-10-16T19:12",
        "end": "2026-10-16T19:32"
      }
    },
    {
      "id": "8L-2.1",
      "kind": "task",
      "parent": "8L-2",
      "name": "Guide: moving a legacy instance",
      "status": "done",
      "start": "2026-10-16T18:54",
      "end": "2026-10-16T19:02"
    },
    {
      "id": "8L-2.2",
      "kind": "task",
      "parent": "8L-2",
      "name": "Guide: a new instance",
      "status": "done",
      "start": "2026-10-16T19:02",
      "end": "2026-10-16T19:03"
    },
    {
      "id": "8L-2.3",
      "kind": "task",
      "parent": "8L-2",
      "name": "README pointer, CLAUDE.md row",
      "status": "done",
      "start": "2026-10-16T19:03",
      "end": "2026-10-16T19:04"
    },
    {
      "id": "8L-2.4",
      "kind": "task",
      "parent": "8L-2",
      "name": "Announcement drafts (#bot-updates, official server)",
      "status": "done",
      "start": "2026-10-16T19:04",
      "end": "2026-10-16T19:12"
    },
    {
      "id": "8C-K",
      "kind": "plan",
      "parent": "16",
      "name": "8C-K The legacy cleanup keeps trains, meetups and saved parties",
      "status": "done",
      "size": 0.25,
      "dependsOn": [
        "8C"
      ],
      "scope": "/admin cleanup-legacy lists the channels of legacy trains, meetups and saved parties apart (name, day made, sign-ups) and deletes none; cutover-check counts them; runbook, guide, announcements (Matt, 2026-10-21)",
      "planning": {
        "start": "2026-10-22T07:28",
        "end": "2026-10-22T09:35"
      }
    },
    {
      "id": "8C-K.1",
      "kind": "task",
      "parent": "8C-K",
      "name": "The channels that stay: the list, the check, the docs",
      "status": "done",
      "start": "2026-10-22T09:35",
      "end": "2026-10-22T09:56"
    },
    {
      "id": "8M-13",
      "kind": "plan",
      "parent": "16",
      "name": "8M-13 The web map's last small fixes",
      "status": "done",
      "size": 0.5,
      "dependsOn": [],
      "scope": "T1 a train’s direction, S7 its stops ahead, A1 and A2 answers, I1 L1 L2 visitors, O1 Find’s misspellings, S10 Light/Dark/Device, three checklist fixes",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-29T08:26",
        "end": "2026-10-29T12:24",
        "review": {
          "start": "2026-10-29T09:45",
          "end": "2026-10-29T12:05"
        }
      },
      "review": {
        "start": "2026-10-29T12:36",
        "end": "2026-10-29T13:28"
      }
    },
    {
      "id": "8M-13.1",
      "kind": "task",
      "parent": "8M-13",
      "name": "A train's direction: larger arrowheads and a flow",
      "status": "done",
      "start": "2026-10-29T12:24",
      "end": "2026-10-29T12:27"
    },
    {
      "id": "8M-13.2",
      "kind": "task",
      "parent": "8M-13",
      "name": "A train's stops ahead as numbered badges",
      "status": "done",
      "start": "2026-10-29T12:27",
      "end": "2026-10-29T12:31"
    },
    {
      "id": "8M-13.3",
      "kind": "task",
      "parent": "8M-13",
      "name": "Answers without list marks; the phone card’s nudge",
      "status": "done",
      "start": "2026-10-29T12:31",
      "end": "2026-10-29T12:33"
    },
    {
      "id": "8M-13.4",
      "kind": "task",
      "parent": "8M-13",
      "name": "Visitors: their layers, the invite on a phone, Gyms off hides a search",
      "status": "done",
      "start": "2026-10-29T12:33",
      "end": "2026-10-29T12:34"
    },
    {
      "id": "8M-13.5",
      "kind": "task",
      "parent": "8M-13",
      "name": "Find: misspelt places only when nothing else is found",
      "status": "done",
      "start": "2026-10-29T12:34",
      "end": "2026-10-29T12:35"
    },
    {
      "id": "8M-13.6",
      "kind": "task",
      "parent": "8M-13",
      "name": "Light, Dark or Device",
      "status": "done",
      "start": "2026-10-29T12:35",
      "end": "2026-10-29T12:36"
    },
    {
      "id": "8M-14",
      "kind": "plan",
      "parent": "16",
      "name": "8M-14 The web’s top page",
      "status": "done",
      "size": 0.5,
      "dependsOn": [],
      "scope": "/ leads to the map after a Discord login: your servers, the invites of servers you could join, no server named to anybody logged out",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-29T20:02",
        "end": "2026-10-29T20:55",
        "review": {
          "start": "2026-10-29T20:24",
          "end": "2026-10-29T20:38"
        }
      },
      "review": {
        "start": "2026-10-29T21:21",
        "end": "2026-10-29T22:00"
      }
    },
    {
      "id": "8M-14.1",
      "kind": "task",
      "parent": "8M-14",
      "name": "Which servers have a map, and the answer of the top page",
      "status": "done",
      "start": "2026-10-29T20:55",
      "end": "2026-10-29T21:19"
    },
    {
      "id": "8M-14.2",
      "kind": "task",
      "parent": "8M-14",
      "name": "The top page’s route and its pages",
      "status": "done",
      "start": "2026-10-29T21:19",
      "end": "2026-10-29T21:20"
    },
    {
      "id": "8M-14.3",
      "kind": "task",
      "parent": "8M-14",
      "name": "The top page’s Log out and its look",
      "status": "done",
      "start": "2026-10-29T21:20",
      "end": "2026-10-29T21:21"
    },
    {
      "id": "8M-15",
      "kind": "plan",
      "parent": "16",
      "name": "8M-15 The small web plan before the cutover",
      "status": "done",
      "size": 0.5,
      "dependsOn": [],
      "scope": "Popups headed by the tapped place with Also nearby, the × beside the first line, stop badges on the line counted from the train, the short pages’ cards alike, Campfire once in the events listing",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-30T03:49",
        "end": "2026-10-30T06:59",
        "review": {
          "start": "2026-10-30T04:53",
          "end": "2026-10-30T05:45"
        }
      },
      "review": {
        "start": "2026-10-30T07:11",
        "end": "2026-10-30T09:53"
      }
    },
    {
      "id": "8M-15.1",
      "kind": "task",
      "parent": "8M-15",
      "name": "The place list: Also nearby",
      "status": "done",
      "start": "2026-10-30T06:59",
      "end": "2026-10-30T07:03"
    },
    {
      "id": "8M-15.2",
      "kind": "task",
      "parent": "8M-15",
      "name": "The popup’s × in a header row",
      "status": "done",
      "start": "2026-10-30T07:03",
      "end": "2026-10-30T07:05"
    },
    {
      "id": "8M-15.3",
      "kind": "task",
      "parent": "8M-15",
      "name": "A train’s stop badges on its line, counted from the train",
      "status": "done",
      "start": "2026-10-30T07:05",
      "end": "2026-10-30T07:07"
    },
    {
      "id": "8M-15.4",
      "kind": "task",
      "parent": "8M-15",
      "name": "The short pages’ cards alike (P1)",
      "status": "done",
      "start": "2026-10-30T07:07",
      "end": "2026-10-30T07:09"
    },
    {
      "id": "8M-15.5",
      "kind": "task",
      "parent": "8M-15",
      "name": "Campfire in the events listing and posts (V1), /help meetup’s paragraphs (V2)",
      "status": "done",
      "start": "2026-10-30T07:09",
      "end": "2026-10-30T07:11"
    },
    {
      "id": "8M-16",
      "kind": "plan",
      "parent": "16",
      "name": "8M-16 Live updates on the map",
      "status": "done",
      "size": 1,
      "dependsOn": [],
      "scope": "Server-Sent Events telling open maps a list changed, with polling as the fallback; spread and window so a busy server is not asked all at once; paced member lookups; the raid boss list and parties’ looks kept",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-31T04:53",
        "end": "2026-10-31T10:19"
      },
      "review": {
        "start": "2026-10-31T13:07",
        "end": "2026-10-31T13:07"
      }
    },
    {
      "id": "8M-16.1",
      "kind": "task",
      "parent": "8M-16",
      "name": "LiveSignals",
      "status": "done",
      "start": "2026-10-31T11:42",
      "end": "2026-10-31T11:42"
    },
    {
      "id": "8M-16.2",
      "kind": "task",
      "parent": "8M-16",
      "name": "The stream, GET /api/live",
      "status": "done",
      "start": "2026-10-31T11:42",
      "end": "2026-10-31T11:42"
    },
    {
      "id": "8M-16.3",
      "kind": "task",
      "parent": "8M-16",
      "name": "What tells the streams",
      "status": "done",
      "start": "2026-10-31T11:42",
      "end": "2026-10-31T11:42"
    },
    {
      "id": "8M-16.4",
      "kind": "task",
      "parent": "8M-16",
      "name": "The page follows the stream",
      "status": "done",
      "start": "2026-10-31T11:42",
      "end": "2026-10-31T12:50"
    },
    {
      "id": "8M-16.5",
      "kind": "task",
      "parent": "8M-16",
      "name": "Limits, a group’s choice kept, docs",
      "status": "done",
      "start": "2026-10-31T12:50",
      "end": "2026-10-31T12:50"
    },
    {
      "id": "8M-16.6",
      "kind": "task",
      "parent": "8M-16",
      "name": "The list costs little for unchanged parties",
      "status": "done",
      "start": "2026-10-31T12:50",
      "end": "2026-10-31T13:07"
    },
    {
      "id": "8M-17",
      "kind": "plan",
      "parent": "16",
      "name": "8M-17 Tours of the map and the region editor",
      "status": "done",
      "size": 1,
      "dependsOn": [],
      "scope": "A skippable spotlight walk-through on a first visit, for members and visitors, on desktop and phone; the region editor has its own; both come back from the menu",
      "doneWhen": "Merged into main-dev",
      "planning": {
        "start": "2026-11-02T13:30",
        "end": "2026-11-02T15:10"
      },
      "review": {
        "start": "2026-11-02T15:55",
        "end": "2026-11-02T16:15"
      }
    },
    {
      "id": "8M-17.1",
      "kind": "task",
      "parent": "8M-17",
      "name": "The map's tour",
      "status": "done",
      "start": "2026-11-02T15:10",
      "end": "2026-11-02T15:45"
    },
    {
      "id": "8M-17.2",
      "kind": "task",
      "parent": "8M-17",
      "name": "The region editor's tour",
      "status": "done",
      "start": "2026-11-02T15:45",
      "end": "2026-11-02T15:55"
    },
    {
      "id": "8M-17.3",
      "kind": "task",
      "parent": "8M-17",
      "name": "Fixes of the review",
      "status": "done",
      "start": "2026-11-02T16:00",
      "end": "2026-11-02T16:30"
    },
    {
      "id": "8M-18",
      "kind": "plan",
      "parent": "16",
      "name": "8M-18 The tutorial on Discord",
      "status": "done",
      "size": 1,
      "dependsOn": [],
      "scope": "A crash course for members, posted and kept current by /admin tutorial, in the voice of the legacy tutorial, which the web tours now share",
      "doneWhen": "Merged into main-dev",
      "planning": {
        "start": "2026-11-02T16:30",
        "end": "2026-11-02T16:50"
      },
      "review": {
        "start": "2026-11-02T18:52",
        "end": "2026-11-02T19:10"
      }
    },
    {
      "id": "8M-18.1",
      "kind": "task",
      "parent": "8M-18",
      "name": "The tours in the tutorial’s voice",
      "status": "done",
      "start": "2026-11-02T16:43",
      "end": "2026-11-02T16:50"
    },
    {
      "id": "8M-18.2",
      "kind": "task",
      "parent": "8M-18",
      "name": "/admin tutorial",
      "status": "done",
      "start": "2026-11-02T16:50",
      "end": "2026-11-02T18:52"
    },
    {
      "id": "8M-19",
      "kind": "plan",
      "parent": "16",
      "name": "8M-19 Hover names and a wrong tap in Report",
      "status": "done",
      "size": 1,
      "dependsOn": [],
      "scope": "A place's name on a mouse's hover, never on a tap; \"← Another gym\" (Power Spot, PokéStop) on the forms a tap in Report's step 2 opened",
      "doneWhen": "Merged into main-dev",
      "review": {
        "start": "2026-11-02T22:20",
        "end": "2026-11-02T22:50"
      }
    },
    {
      "id": "8M-19.1",
      "kind": "task",
      "parent": "8M-19",
      "name": "Hover names and ← Another",
      "status": "done",
      "start": "2026-11-02T21:50",
      "end": "2026-11-02T22:20"
    },
    {
      "id": "8Z",
      "kind": "plan",
      "parent": "16",
      "name": "8Z Security pass before the cutover",
      "status": "done",
      "size": 1,
      "dependsOn": [],
      "scope": "Meetups after approval, pins in /wild near:, group pings, floods, the map's writes and logins, Google by hand, the map's Delete…, the Docker socket through a proxy",
      "doneWhen": "Merged into main-dev",
      "review": {
        "start": "2026-11-01T22:05",
        "end": "2026-11-01T22:18"
      }
    },
    {
      "id": "8Z.1",
      "kind": "task",
      "parent": "8Z",
      "name": "A meetup's name and information for its maker and staff, the moderators told",
      "status": "done",
      "start": "2026-11-01T20:56",
      "end": "2026-11-01T20:56"
    },
    {
      "id": "8Z.2",
      "kind": "task",
      "parent": "8Z",
      "name": "Pins in /wild near: refused to a blocked member",
      "status": "done",
      "start": "2026-11-01T20:56",
      "end": "2026-11-01T20:59"
    },
    {
      "id": "8Z.3",
      "kind": "task",
      "parent": "8Z",
      "name": "Role-gated forums in the guides",
      "status": "done",
      "start": "2026-11-01T20:59",
      "end": "2026-11-01T20:59"
    },
    {
      "id": "8Z.4",
      "kind": "task",
      "parent": "8Z",
      "name": "At most one ping of a new group per party every 5 minutes",
      "status": "done",
      "start": "2026-11-01T20:59",
      "end": "2026-11-01T21:02"
    },
    {
      "id": "8Z.5",
      "kind": "task",
      "parent": "8Z",
      "name": "Splits in /train's limit, at most 5 open trains and meetups",
      "status": "done",
      "start": "2026-11-01T21:02",
      "end": "2026-11-01T21:17"
    },
    {
      "id": "8Z.6",
      "kind": "task",
      "parent": "8Z",
      "name": "Map writes, the shared member fetch, the editor and the OAuth exchange",
      "status": "done",
      "start": "2026-11-01T21:17",
      "end": "2026-11-01T21:25"
    },
    {
      "id": "8Z.7",
      "kind": "task",
      "parent": "8Z",
      "name": "Google by hand: /gym refresh limited, a monthly cap",
      "status": "done",
      "start": "2026-11-01T21:25",
      "end": "2026-11-01T21:32"
    },
    {
      "id": "8Z.8",
      "kind": "task",
      "parent": "8Z",
      "name": "The map's Delete… needs Manage Messages",
      "status": "done",
      "start": "2026-11-01T21:32",
      "end": "2026-11-01T21:35"
    },
    {
      "id": "8Z.9",
      "kind": "task",
      "parent": "8Z",
      "name": "The Docker socket through a proxy, the watchdog without root",
      "status": "done",
      "start": "2026-11-01T21:35",
      "end": "2026-11-01T21:45"
    },
    {
      "id": "8F-1",
      "kind": "plan",
      "parent": "16",
      "name": "8F-1 Discord's small fixes before the cutover",
      "status": "done",
      "size": 0.5,
      "dependsOn": [],
      "scope": "No timeless Elite egg (8E-1), a cut Power Spot name asks (8X-S), no post for a stop-only import (8W-3), catch CP for max bosses, the guide’s line, /help in paragraphs",
      "doneWhen": "Merged into typescript-migration",
      "planning": {
        "start": "2026-10-29T08:26",
        "end": "2026-10-29T11:31",
        "review": {
          "start": "2026-10-29T09:35",
          "end": "2026-10-29T09:47"
        }
      },
      "review": {
        "start": "2026-10-29T11:38",
        "end": "2026-10-29T15:27"
      }
    },
    {
      "id": "8F-1.1",
      "kind": "task",
      "parent": "8F-1",
      "name": "No timeless Elite egg",
      "status": "done",
      "start": "2026-10-29T11:31",
      "end": "2026-10-29T11:34"
    },
    {
      "id": "8F-1.2",
      "kind": "task",
      "parent": "8F-1",
      "name": "A cut Power Spot name that fits other regions asks",
      "status": "done",
      "start": "2026-10-29T11:34",
      "end": "2026-10-29T11:35"
    },
    {
      "id": "8F-1.3",
      "kind": "task",
      "parent": "8F-1",
      "name": "No #bot-updates post for a stop-only import; the guide’s line",
      "status": "done",
      "start": "2026-10-29T11:35",
      "end": "2026-10-29T11:36"
    },
    {
      "id": "8F-1.4",
      "kind": "task",
      "parent": "8F-1",
      "name": "Catch CP in a max battle's post",
      "status": "done",
      "start": "2026-10-29T11:36",
      "end": "2026-10-29T11:37"
    },
    {
      "id": "8F-1.5",
      "kind": "task",
      "parent": "8F-1",
      "name": "The help in paragraphs",
      "status": "done",
      "start": "2026-10-29T11:37",
      "end": "2026-10-29T11:38"
    },
    {
      "id": "8H-2",
      "kind": "plan",
      "parent": "16",
      "name": "8H-2 The history of reports at stops",
      "size": 1,
      "dependsOn": [],
      "scope": "Every research and Team GO Rocket report that ends kept as a record: S2 cell and regions, confirmations, how it ended; reporter only with the opt-in (history design Part A)",
      "doneWhen": "Merged into main-dev",
      "planning": {
        "start": "2026-11-04T11:39",
        "end": "2026-11-04T15:24",
        "review": {
          "start": "2026-11-04T12:43",
          "end": "2026-11-04T14:41"
        }
      },
      "status": "done",
      "review": {
        "start": "2026-11-04T15:39",
        "end": "2026-11-04T16:39"
      }
    },
    {
      "id": "8H-2.1",
      "kind": "task",
      "parent": "8H-2",
      "name": "Migration 035: the history table, cells, regions and confirmations on StopReport",
      "status": "done",
      "start": "2026-11-04T15:24",
      "end": "2026-11-04T15:29"
    },
    {
      "id": "8H-2.2",
      "kind": "task",
      "parent": "8H-2",
      "name": "The endings of a stop report in the domain",
      "status": "done",
      "start": "2026-11-04T15:29",
      "end": "2026-11-04T15:31"
    },
    {
      "id": "8H-2.3",
      "kind": "task",
      "parent": "8H-2",
      "name": "The repository: history written on save, take back, sweep and restore",
      "status": "done",
      "start": "2026-11-04T15:31",
      "end": "2026-11-04T15:33"
    },
    {
      "id": "8H-2.4",
      "kind": "task",
      "parent": "8H-2",
      "name": "The service and its callers: cells, regions, reasons",
      "status": "done",
      "start": "2026-11-04T15:33",
      "end": "2026-11-04T15:35"
    },
    {
      "id": "8H-2.5",
      "kind": "task",
      "parent": "8H-2",
      "name": "The opt-out covers stop reports; the words of /settings history",
      "status": "done",
      "start": "2026-11-04T15:35",
      "end": "2026-11-04T15:38"
    },
    {
      "id": "8H-2.6",
      "kind": "task",
      "parent": "8H-2",
      "name": "Docs: history.md and stop-reports.md",
      "status": "done",
      "start": "2026-11-04T15:38",
      "end": "2026-11-04T15:39"
    },
    {
      "id": "8H-3",
      "kind": "plan",
      "parent": "16",
      "name": "8H-3 Reach and want counts",
      "size": 1,
      "dependsOn": [],
      "scope": "How many members each report was sent to (parties and reports at stops), and a daily count of wants per target, no member (history design Part A)",
      "doneWhen": "Merged into main-dev",
      "planning": {
        "start": "2026-11-04T21:04",
        "end": "2026-11-04T22:23",
        "review": {
          "start": "2026-11-04T21:47",
          "end": "2026-11-04T22:17"
        }
      },
      "status": "done",
      "review": {
        "start": "2026-11-04T22:29",
        "end": "2026-11-04T23:39"
      }
    },
    {
      "id": "8H-3.1",
      "kind": "task",
      "parent": "8H-3",
      "name": "Migration 037: reach columns and WantCountDay",
      "status": "done",
      "start": "2026-11-04T22:23",
      "end": "2026-11-04T22:25"
    },
    {
      "id": "8H-3.2",
      "kind": "task",
      "parent": "8H-3",
      "name": "Reach counted in the notifier",
      "status": "done",
      "start": "2026-11-04T22:25",
      "end": "2026-11-04T22:26"
    },
    {
      "id": "8H-3.3",
      "kind": "task",
      "parent": "8H-3",
      "name": "Reach recorded on parties and stop reports",
      "status": "done",
      "start": "2026-11-04T22:26",
      "end": "2026-11-04T22:27"
    },
    {
      "id": "8H-3.4",
      "kind": "task",
      "parent": "8H-3",
      "name": "Want counts each local midnight",
      "status": "done",
      "start": "2026-11-04T22:27",
      "end": "2026-11-04T22:28"
    },
    {
      "id": "8H-3.5",
      "kind": "task",
      "parent": "8H-3",
      "name": "Docs: history.md and notifications-and-dms.md",
      "status": "done",
      "start": "2026-11-04T22:28",
      "end": "2026-11-04T22:29"
    },
    {
      "id": "8H-4",
      "kind": "plan",
      "parent": "16",
      "name": "8H-4 The activity heatmap",
      "size": 1,
      "dependsOn": [],
      "scope": "A members-only layer of the web map: where raids and max battles happen, expected now by weekday and hour with a one-year half-life, and history back to 2018 (history design Part B)",
      "doneWhen": "Merged into main-dev",
      "planning": {
        "start": "2026-11-04T23:39",
        "end": "2026-11-05T02:04",
        "review": {
          "start": "2026-11-05T01:17",
          "end": "2026-11-05T02:03"
        }
      },
      "status": "done",
      "review": {
        "start": "2026-11-05T02:12",
        "end": "2026-11-05T02:56"
      }
    },
    {
      "id": "8H-4.1",
      "kind": "task",
      "parent": "8H-4",
      "name": "Migration 038: ActivityBucket and ActivityProgress",
      "status": "done",
      "start": "2026-11-05T02:04",
      "end": "2026-11-05T02:06"
    },
    {
      "id": "8H-4.2",
      "kind": "task",
      "parent": "8H-4",
      "name": "What counts and the weights, in the domain",
      "status": "done",
      "start": "2026-11-05T02:06",
      "end": "2026-11-05T02:07"
    },
    {
      "id": "8H-4.3",
      "kind": "task",
      "parent": "8H-4",
      "name": "The buckets kept up hourly, and their rebuild",
      "status": "done",
      "start": "2026-11-05T02:07",
      "end": "2026-11-05T02:08"
    },
    {
      "id": "8H-4.4",
      "kind": "task",
      "parent": "8H-4",
      "name": "The route: weights per place for a mode",
      "status": "done",
      "start": "2026-11-05T02:08",
      "end": "2026-11-05T02:09"
    },
    {
      "id": "8H-4.5",
      "kind": "task",
      "parent": "8H-4",
      "name": "The map layer and its panel",
      "status": "done",
      "start": "2026-11-05T02:09",
      "end": "2026-11-05T02:11"
    },
    {
      "id": "8H-4.6",
      "kind": "task",
      "parent": "8H-4",
      "name": "Docs: history.md, web.md, operations.md",
      "status": "done",
      "start": "2026-11-05T02:11",
      "end": "2026-11-05T02:12"
    },
    {
      "id": "8H-5",
      "kind": "plan",
      "parent": "16",
      "name": "8H-5 The region board",
      "size": 1,
      "dependsOn": [],
      "scope": "Raids and max battles per region this month, this year and all time, legacy included: a private answer with Share on Discord, and the start of the web history page (history design Part C)",
      "doneWhen": "Merged into main-dev",
      "planning": {
        "start": "2026-11-05T02:56",
        "end": "2026-11-05T08:05",
        "review": {
          "start": "2026-11-05T04:32",
          "end": "2026-11-05T07:52"
        }
      },
      "status": "done",
      "review": {
        "start": "2026-11-05T08:11",
        "end": "2026-11-05T09:00"
      }
    },
    {
      "id": "8H-5.1",
      "kind": "task",
      "parent": "8H-5",
      "name": "The board in the domain, and the sum per region",
      "status": "done",
      "start": "2026-11-05T08:05",
      "end": "2026-11-05T08:07"
    },
    {
      "id": "8H-5.2",
      "kind": "task",
      "parent": "8H-5",
      "name": "The stats regions command",
      "status": "done",
      "start": "2026-11-05T08:07",
      "end": "2026-11-05T08:08"
    },
    {
      "id": "8H-5.3",
      "kind": "task",
      "parent": "8H-5",
      "name": "Share: the board posted in the channel",
      "status": "done",
      "start": "2026-11-05T08:08",
      "end": "2026-11-05T08:08"
    },
    {
      "id": "8H-5.4",
      "kind": "task",
      "parent": "8H-5",
      "name": "The route of the board",
      "status": "done",
      "start": "2026-11-05T08:08",
      "end": "2026-11-05T08:09"
    },
    {
      "id": "8H-5.5",
      "kind": "task",
      "parent": "8H-5",
      "name": "The history page",
      "status": "done",
      "start": "2026-11-05T08:09",
      "end": "2026-11-05T08:10"
    },
    {
      "id": "8H-5.6",
      "kind": "task",
      "parent": "8H-5",
      "name": "Docs",
      "status": "done",
      "start": "2026-11-05T08:10",
      "end": "2026-11-05T08:11"
    },
    {
      "id": "8H-4H",
      "kind": "plan",
      "parent": "16",
      "name": "8H-4H The heat layer",
      "size": 1,
      "dependsOn": [],
      "scope": "The Activity layer drawn as a heat glow (simpleheat, our own module), its counts in the gym and Power Spot popups and a desktop cluster tooltip, invisible circles at street zoom when Gyms is off",
      "doneWhen": "Merged into main-dev",
      "planning": {
        "start": "2026-11-05T09:08",
        "end": "2026-11-05T11:03",
        "review": {
          "start": "2026-11-05T09:37",
          "end": "2026-11-05T10:54"
        }
      }
    },
    {
      "id": "8H-4H.1",
      "kind": "task",
      "parent": "8H-4H",
      "name": "simpleheat as our own module",
      "status": "todo"
    },
    {
      "id": "8H-4H.2",
      "kind": "task",
      "parent": "8H-4H",
      "name": "The heat layer in place of the circles",
      "status": "todo"
    },
    {
      "id": "8H-4H.3",
      "kind": "task",
      "parent": "8H-4H",
      "name": "Counts in the gym and Power Spot popups, the cluster tooltip",
      "status": "todo"
    },
    {
      "id": "8H-4H.4",
      "kind": "task",
      "parent": "8H-4H",
      "name": "Invisible circles at street zoom without Gyms",
      "status": "todo"
    },
    {
      "id": "8H-4H.5",
      "kind": "task",
      "parent": "8H-4H",
      "name": "Docs",
      "status": "todo"
    },
    {
      "id": "16-staging",
      "kind": "plan",
      "parent": "16",
      "name": "The remaining staging checklists (with Matt)",
      "status": "unplanned",
      "size": 2
    },
    {
      "id": "16-rehearsal",
      "kind": "plan",
      "parent": "16",
      "name": "The rehearsal with production's copy (runbook R1–R6)",
      "status": "unplanned",
      "size": 1
    },
    {
      "id": "16-night",
      "kind": "plan",
      "parent": "16",
      "name": "The cutover night and the first push",
      "status": "unplanned",
      "size": 1
    }
  ]
};
