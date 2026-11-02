import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { ConfigError } from './errors.js';
import { OCR_DEVICES, OCR_HEAD_ICON_URL, OCR_MODELS_URL } from '../domain/ocr/assets.js';
import { DEFAULT_LOBBIES, MAX_LOBBY, MIN_LOBBY } from '../domain/party/lobby.js';

const minutes = z.number().int().positive();
const milliseconds = z.number().int().positive();
const seconds = z.number().int().positive();
const lobby = z.number().int().min(MIN_LOBBY).max(MAX_LOBBY);

/** Pokebattler's raid list, the max bosses' feed (`settings.maxBattles.url` unless set). */
export const MAX_BOSS_FEED_URL = 'https://fight.pokebattler.com/raids';
/**
 * Leek Duck's raid manifest, the raid rotations in force (`settings.raidBosses.manifestUrl` unless
 * set; plan 8B-L).
 */
export const RAID_MANIFEST_URL = 'https://leekduck.com/raids/manifest.json';
/** Leek Duck's research page, the task list (`settings.research.url` unless set). */
export const RESEARCH_URL = 'https://leekduck.com/research/';
/** ScrapedDuck's Rocket lineups, `/rocket`'s choices (`settings.rocket.url` unless set). */
export const ROCKET_LINEUPS_URL =
  'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.min.json';
/** A time of day, `HH:MM` on a 24-hour clock (`7:30` is `07:30`). */
const clockTime = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, { error: 'must be a time of day, as 06:00 or 21:00' })
  .transform((time) => time.padStart(5, '0'));

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Keys an older settings file may still have, and that mean nothing any more: the durations of
 * EX raids, a tier that plan 4F removed; the folder the eggs' pictures were shown from, since
 * the bot carries square ones of its own (plan 8D-F). The schema is strict, so that a misspelt
 * key is refused; these are taken out first, so that a file from before the removal still
 * starts. Top-level keys only.
 */
export const RETIRED_SETTINGS = [
  'exclusiveRaidIncubateDuration',
  'exclusiveRaidHatchedDuration',
  'raidEggPicturesUrl',
] as const;

/** A settings file as it was read, without the keys of `RETIRED_SETTINGS`. */
export function withoutRetiredSettings(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const retired: readonly string[] = RETIRED_SETTINGS;
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !retired.includes(key)));
}

/** The hosts a public address may name with plain http: this machine (`publicUrl`). */
const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

/** Whether a public address is one of this machine's, where the cookie cannot be `Secure`. */
export function isLocalAddress(publicUrl: string): boolean {
  return LOCAL_HOSTS.includes(new URL(publicUrl).hostname);
}

/**
 * An address of Discord's invites (plan 8M-11B, `web.invites`): `https://discord.gg/<code>` or
 * `https://discord.com/invite/<code>`, the code (a vanity one too) letters, digits and hyphens,
 * nothing after it.
 */
const INVITE_ADDRESS = /^https:\/\/(?:discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,32}$/u;

/**
 * The address every link of the web server points at (spec 2.1): `https:`, or `http:` for this
 * machine alone (the cookie is `Secure` otherwise); the root of its host, nothing after it, kept
 * without the slash so that a path is appended as it is.
 */
const publicUrl = z
  .url({ protocol: /^https?$/ })
  .superRefine((value, ctx) => {
    // `z.url` has said what is wrong with no address at all.
    if (!URL.canParse(value)) return;
    const url = new URL(value);
    if (url.protocol === 'http:' && !LOCAL_HOSTS.includes(url.hostname)) {
      ctx.addIssue({
        code: 'custom',
        message: 'must be https: unless it is localhost, 127.0.0.1 or [::1]',
      });
    }
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || value.includes('?')) {
      ctx.addIssue({ code: 'custom', message: 'must be the root of its host, with no path' });
    }
    if (url.username !== '' || url.password !== '') {
      ctx.addIssue({ code: 'custom', message: 'must not carry a user name or password' });
    }
  })
  .transform((value) => new URL(value).origin);

/**
 * An optional channel of the settings, by its name as it is written (blank is unset): the
 * moderators' channel (plan 8S-1), the events forum (plan 8V-1).
 */
const optionalChannelName = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() || undefined : value),
  z
    .string()
    .refine((name) => !name.startsWith('#'), {
      message: "must be a channel's name as it is written, without #",
    })
    .optional(),
);

const settingsObject = z.strictObject({
  standardRaidIncubateDuration: minutes,
  standardRaidHatchedDuration: minutes,
  eliteRaidIncubateDuration: minutes,
  eliteRaidHatchedDuration: minutes,
  maxRaidHatchedDuration: minutes,
  maxMeetupLeadupDuration: minutes,
  maximumAdditionalAttendees: z.number().int().positive(),
  /**
   * How many trainers one lobby holds, by the kind of battle (design
   * `2026-10-20-max-battles-design.md`, section 4): `dynamax` and `gigantamax` are the sizes Join
   * fills a max battle's groups to (and a Gigantamax train's), and the `3/4 coming` of a group's
   * line; `raid` is only the size above which a raid's or a train's group is told to split up
   * (their members choose their groups). Each 1 to 100; a file without them, or without one, takes the game's: 20, 4, 100.
   */
  lobbies: z
    .strictObject({
      raid: lobby.default(DEFAULT_LOBBIES.raid),
      dynamax: lobby.default(DEFAULT_LOBBIES.dynamax),
      gigantamax: lobby.default(DEFAULT_LOBBIES.gigantamax),
    })
    .default(() => ({ ...DEFAULT_LOBBIES })),
  startClearTime: minutes,
  deletionGraceTime: minutes,
  deletionWarningTime: minutes,
  trainOrMeetupDeletionWarningTime: minutes,
  raidCompleteTimeout: minutes,
  maximumMeetupLeadtime: minutes,
  /**
   * Seconds (as the legacy bot read it, whatever its name says) before its upload a screenshot
   * without a usable clock is taken to be from.
   */
  screenshotMessageOffsetTime: seconds,
  cleanupInterval: milliseconds,
  messageCleanupDelaySuccess: milliseconds,
  messageCleanupDelayError: milliseconds,
  messageCleanupDelayStatus: milliseconds,
  showUnknownMoves: z.boolean(),
  databaseRaids: z.boolean(),
  postNewGyms: z.boolean(),
  /**
   * The monthly budget of the line that waits for Google (plan 8W-6; `GymUpkeep`): how many
   * Places searches (Nearby Search Pro, 5,000 free a month) are asked a month, counted from the
   * 1st at midnight Pacific time, when Google's free amounts reset. Every places question counts,
   * in the line or not; the line stops when only `googleLookupsReserve` is left, which gyms added
   * and moved by hand and `/gym refresh` may use (and go past the budget: an admin asked).
   * `googleGeocodesPerMonth` is the line's budget of Geocodings (10,000 free a month), asked only
   * for a gym without an address. The reserve stays below the budget, unless both are 0 (the line
   * stopped). `googleLookupsPerDay` of before is gone, and refused as any unknown key is.
   * Google counts its free amounts per billing account, not per key or instance: instances whose
   * keys bill to one account (a dev instance beside production) share them and must split the
   * budget between them, or the account pays for what goes past.
   */
  googleLookupsPerMonth: z.number().int().min(0).default(4_500),
  googleLookupsReserve: z.number().int().min(0).default(500),
  googleGeocodesPerMonth: z.number().int().min(0).default(9_000),
  /**
   * A hard cap on the lookups by hand in a Pacific month (plan 8Z): `/gym refresh`, a gym added or
   * moved, each one geocode and one places search. Past it `/gym refresh` asks nothing, and a gym
   * added or moved waits in the line. Counted per database, so per instance: where instances
   * share a billing account, split it with the budget above (a dev instance set low).
   */
  googleByHandPerMonth: z.number().int().min(0).default(500),
  /**
   * Where admins ask for the Pine Wayspot export tool, which makes the file `/gym import` reads
   * (plan 8W-P; Matt, 2026-10-19): the page `/userscript` of the instance that hands it out. Its
   * help and `docs/guides/new-instance.md` name it.
   */
  wayspotTool: z.url({ protocol: /^https?$/ }).default('https://profpine.com/userscript'),
  updater: z.strictObject({
    channelIndexUpdateIntervalSeconds: z.number().int().positive(),
    gymPlacesIndexUpdateIntervalSeconds: z.number().int().positive(),
  }),
  emoji: z.strictObject({
    thumbsUp: z.string(),
    thumbsDown: z.string(),
    shiny: z.string(),
    remote: z.string(),
  }),
  features: z.strictObject({
    exGymChannel: z.boolean(),
    remoteRaidChannel: z.boolean(),
    notifications: z.boolean(),
    roles: z.boolean(),
  }),
  roles: z.strictObject({ unown: z.string().min(1) }),
  channels: z
    .strictObject({
      'bot-lab': z.string().min(1),
      'mod-bot-lab': z.string().min(1),
      unown: z.string().min(1),
      'elite-gym-raids': z.string().min(1),
      'remote-raids': z.string().min(1),
      pvp: z.string().min(1),
      'bot-updates': z.string().min(1),
      /**
       * The moderators' channel of meetup safety (plan 8S-1; spec
       * `2026-10-17-meetup-safety-design.md`): a meetup at a place that might be private (a pin,
       * a Wayspot whose title looks like a front-yard feature) waits there for a moderator, and
       * appeals of blocked members go there. It must be seen by staff only, and is never another
       * channel of these settings (refused: the public bot updates channel would show the
       * requests, and the other channels get the bot's other posts). Unset (the default; blank is
       * unset): meetup safety is off, every place is allowed, and there are no requests or blocks;
       * the start logs a warning per server and `cutover-check` warns. Unlike the other channels
       * it is optional.
       */
      moderation: optionalChannelName,
      /**
       * The events forum (plan 8V-1; design `2026-10-28-events-forum-design.md`): one forum per
       * server with Pine's pinned listing "Events" of the game's events and a post per bigger
       * event. A name as it is written, without #; unset (the default; blank is unset): no events
       * forum. `/admin setup-forums` makes it in the category of `bot-updates`; the name decides
       * (a forum recorded under another name is replaced at the next setup).
       */
      events: optionalChannelName,
    })
    .superRefine((channels, ctx) => {
      const { moderation, ...others } = channels;
      if (moderation === undefined) return;
      // Also the events forum (R13): its posts are everyone's.
      const same = Object.entries(others).find(
        ([, name]) => name !== undefined && name.toLowerCase() === moderation.toLowerCase(),
      );
      if (same !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['moderation'],
          message: `must be a channel of its own, not the ${same[0]} channel (#${same[1]})`,
        });
      }
    }),
  categories: z.strictObject({ pvp: z.string().min(1) }),
  /**
   * The events forum's reach (plan 8V-1): the listing names the events that start within
   * `horizonDays` (35 unless set), and an event of a posted kind gets its post `postDaysAhead`
   * days before its start (14 unless set, Matt 2026-10-29; at most `horizonDays`). Named apart
   * from `raidEvents` (R13). Whether there is a forum at all is `channels.events`.
   */
  eventsForum: z
    .strictObject({
      horizonDays: z.number().int().min(1).max(365).default(35),
      postDaysAhead: z.number().int().min(0).max(365).default(14),
    })
    .refine((forum) => forum.postDaysAhead <= forum.horizonDays, {
      error: 'must be at most horizonDays: a post opens for an event the listing names',
      path: ['postDaysAhead'],
    })
    .default(() => ({ horizonDays: 35, postDaysAhead: 14 })),
  /**
   * Meetup safety (plan 8S-1): `flaggedWords` are words and phrases that, in the title of a gym,
   * PokéStop or power spot, send a meetup there to the moderators first, besides the list in
   * the code (`DEFAULT_FLAGGED_WORDS`: little free library, apartments, condos and the like);
   * matched without regard to letter case, as whole words. Absent: the list in the code alone.
   * Whether the safety is on at all is `channels.moderation`.
   */
  meetupSafety: z
    .strictObject({
      flaggedWords: z.array(z.string().trim().min(1).max(100)).max(500).default([]),
    })
    .optional(),
  helpGroups: z.array(z.string().min(1)),
  blacklistWords: z.array(z.string()),
  /**
   * The species that can be reported with `/wild` although the game calls them legendary,
   * mythical or an ultra beast: each by its catalogue key or its name. A text the game data
   * does not know is logged once and ignored. Left out of a file, it is the lake trio, the
   * legendaries that do spawn. The Galarian birds stay refused for now: they appear only from
   * a Daily Adventure Incense, to one trainer, not as spawns others can get (Matt, 2026-10-13;
   * he expects this may change, hence the setting).
   */
  wildSpawnExceptions: z.array(z.string().min(1)).default(['Uxie', 'Mesprit', 'Azelf']),
  /**
   * What the name of a region's forum adds to the name of the region's channel (`north` gets
   * the forum `north-board`; `-meetups` before plan 8R-9): the forum is the region's board, with
   * the raids, max battles, trains and meetups of the region and its pinned post "Today and coming
   * up". `/admin setup-forums` and `/region import` name new forums so, and rename a forum whose
   * name is the region's with another one-word ending (`north-meetups`); a name chosen by hand
   * stays.
   */
  regionForumSuffix: z
    .string()
    .regex(/^-[\p{L}\p{N}_-]{1,30}$/u, { message: 'must be a hyphen and up to 30 letters' })
    .default('-board'),
  /**
   * Address of a map of all regions, which `/maps` gives members; without it the command is
   * not offered. A setting, not the environment variable `REGION_MAP_LINK` the spec named: it is
   * no secret (plan 6A).
   */
  regionMapLink: z.preprocess(
    // Blank means unset, as for the environment's optional values; spaces around are dropped.
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.url({ protocol: /^https?$/ }).optional(),
  ),
  /**
   * Where `/find-region` searches places by name: a Nominatim server (`url`, OpenStreetMap's own
   * by default) and the User-Agent that names this installation to it, as its usage policy
   * asks. Without it the command is not offered (plan 6B).
   */
  findRegion: z
    .strictObject({
      url: z.url({ protocol: /^https$/ }).default('https://nominatim.openstreetmap.org'),
      userAgent: z.string().trim().min(3).max(200),
    })
    .optional(),
  /**
   * The web pages served by the bot (plan 8M-1; spec `2026-10-15-web-map-region-editor-design`):
   * off unless set. Pine serves plain HTTP on `host`:`port`; how the outside reaches it (a
   * tunnel, a proxy) is the operator's, and `publicUrl` is the address every link points at.
   * With `trustProxy` the client's address is read from the forwarding headers, but only from a
   * peer on this machine or a private network. `tiles` picks the map pictures (plan 8M-7): Stadia's
   * Alidade Smooth, light or dark (the default; no key: Stadia checks the page's domain), falling
   * back to OpenStreetMap's when Stadia refuses; OpenStreetMap's alone;
   * or Google's beside Stadia's (needs `GOOGLE_MAPS_BROWSER_KEY`). With `memberRole` (a role's
   * name, compared as Pine's other role settings are: trimmed, whatever its letter case) only a
   * member who has that role, or an administrator, sees and presses a server's parties on the
   * map; any other member is treated as somebody who is not logged in (regions and gyms only).
   * Unset (the default; blank is unset): every member.
   */
  web: z
    .strictObject({
      port: z.number().int().min(1).max(65535),
      host: z.string().trim().min(1).default('127.0.0.1'),
      publicUrl,
      trustProxy: z.boolean().default(false),
      tiles: z.enum(['stadia', 'osm', 'google']).default('stadia'),
      memberRole: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim() || undefined : value),
        z.string().optional(),
      ),
      /**
       * An invite for a logged-in visitor of the map who is not in the server (plan 8M-11B; Matt,
       * 2026-10-28: the server's admin chooses whether it shares one and where newcomers land, so
       * Pine needs no permission and calls Discord for nothing): a server's id to an address of
       * Discord's invites, `https://discord.gg/<code>` or `https://discord.com/invite/<code>` (a
       * vanity code too), nothing after it. A blank one is none; absent, no server has one.
       */
      invites: z
        .preprocess(
          (value) =>
            value !== null && typeof value === 'object' && !Array.isArray(value)
              ? Object.fromEntries(
                  Object.entries(value).flatMap(([server, link]) =>
                    typeof link !== 'string'
                      ? [[server, link]]
                      : link.trim() === ''
                        ? []
                        : [[server, link.trim()]],
                  ),
                )
              : value,
          z.record(
            z.string().regex(/^\d{17,20}$/u, "must be a server's ID"),
            z
              .string()
              .regex(
                INVITE_ADDRESS,
                'must be https://discord.gg/<code> or https://discord.com/invite/<code>',
              ),
          ),
        )
        .optional(),
    })
    .optional(),
  /**
   * Rehearsal mode (plan 8C): the bot runs with a production token against a copy of the
   * production database while the legacy bot is off for a short while, and members must see
   * nothing of it. While it is set: direct messages go only to `allowlist`; nothing is posted
   * but into the posts of parties (no announcements, links in region channels, copies, spawn
   * reports); only `allowlist` and staff (Manage Server, or a role of `staffRoles`) are answered;
   * `/admin setup-forums` makes forums only for the regions whose channels `regions` names, seen
   * only by staff and `allowlist`; and the cleanup of legacy channels only lists. Shown in the
   * log, the health line and an alert to the owner at the start. Absent: off.
   */
  rehearsal: z
    .strictObject({
      allowlist: z.array(z.string().regex(/^\d{17,20}$/u, 'must be a Discord ID')).min(1),
      regions: z
        .array(
          z
            .string()
            .min(1)
            .refine((name) => !name.startsWith('#'), {
              message: "must be a channel's name as it is written, without #",
            }),
        )
        .min(1),
      staffRoles: z.array(z.string().min(1)).default([]),
    })
    .optional(),
  timezone: z
    .string()
    .refine(isTimeZone, { message: 'must be an IANA time zone, e.g. America/New_York' }),
  /**
   * The units every distance Pine says is in, on the map and on Discord alike (Matt,
   * 2026-10-25): `imperial` (feet and miles, the default) or `metric` (meters and kilometers);
   * `distanceWords` of `src/render/distance-words.ts`.
   */
  distanceUnits: z.enum(['imperial', 'metric']).default('imperial'),
  archiveRetentionDays: z.number().int().positive().nullable(),
  /**
   * Reading raid screenshots (Phase 7). The models run in a child process of their own, one
   * screenshot at a time; everything but `passive` and `debug` has a default.
   */
  ocr: z.strictObject({
    /**
     * Whether screenshots are read at all: off, `/read-screenshot` is not offered, `/raid` has
     * no screenshot option and a mention of the bot with a screenshot is not answered.
     */
    enabled: z.boolean().default(true),
    /** Read every image posted in a region channel (needs the Message Content intent). */
    passive: z.boolean(),
    debug: z.boolean(),
    /** Where the models run: the CPU, CUDA (Linux x64, NVIDIA) or DirectML (Windows). */
    device: z.enum(OCR_DEVICES).default('cpu'),
    /** Threads of one model run; 0 leaves it to the runtime (every core). */
    threads: z.number().int().min(0).max(64).default(0),
    /** The priority of the reading process: `low` keeps the bot and the machine responsive. */
    priority: z.enum(['low', 'normal']).default('low'),
    /** How many screenshots may wait while one is read; more are refused for the moment. */
    queue: z.number().int().min(0).max(100).default(10),
    /** How long one screenshot may take before the reading process is ended and started anew. */
    timeoutSeconds: z.number().int().min(5).max(600).default(60),
    /** The folder the model files are downloaded from (`OCR_ASSETS` names and checks them). */
    modelsUrl: z
      .url({ protocol: /^https$/ })
      .refine((url) => url.endsWith('/'), { message: 'must end with /: it is a folder' })
      .default(OCR_MODELS_URL),
    /** The game's tier head, which the heads of a raid screen are matched against. */
    headIconUrl: z.url({ protocol: /^https$/ }).default(OCR_HEAD_ICON_URL),
    /**
     * How many days a screenshot kept for review (`var/ocr/review/`: one Pine was unsure of, or
     * one a member said something about) is kept before it is deleted.
     */
    reviewDays: z.number().int().min(1).max(365).default(30),
    /**
     * How many megabytes the kept screenshots (`var/ocr/held/` and `review/`) may take together;
     * beyond it, those without an issue go first, and a screenshot is read but not kept.
     */
    keepMegabytes: z.number().int().min(10).max(1_000_000).default(4096),
    /** How many screenshots of one server are kept for review a day. */
    reviewPerDay: z.number().int().min(0).max(10_000).default(50),
  }),
  autoAssignRole: z.boolean(),
  gameData: z.strictObject({
    gameMasterUrl: z.url({ protocol: /^https?$/ }),
    textUrl: z.url({ protocol: /^https?$/ }),
    /**
     * Address of the listing of the game's picture files (GitHub's tree of PokeMiners'
     * `pogo_assets`, folder `Images/Pokemon/Addressable Assets`): which icons of Pokémon exist.
     * Downloaded with the game data; an unauthenticated address of GitHub's API answers 60
     * times an hour.
     */
    iconsUrl: z.url({ protocol: /^https?$/ }),
    /**
     * Address of the listing of the megas' portraits (PokeMiners' `Images/Mega Portraits
     * 512x512`), downloaded with the icons: a mega the icon list lacks shows its portrait. Not
     * needed in the file (2026-10-23).
     */
    megaPortraitsUrl: z
      .url({ protocol: /^https?$/ })
      .default(
        'https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master:Images/Mega%20Portraits%20512x512',
      ),
    refreshHours: z.number().int().min(1).max(168),
  }),
  raidBosses: z
    .strictObject({
      /**
       * Address of the raid boss feed (`raids.min.json` of ScrapedDuck, Leek Duck's raid boss page
       * as data): since plan 8B-L the fallback, read when the manifest cannot be used.
       */
      url: z.url({ protocol: /^https?$/ }),
      /**
       * Address of Leek Duck's raid manifest (`RAID_MANIFEST_URL` unless set), read first: the
       * raid rotations and their times, each rotation's bosses on a page beside it
       * (`<slug>.html`). The list is read again just after a rotation starts or ends.
       */
      manifestUrl: z.url({ protocol: /^https?$/ }).default(RAID_MANIFEST_URL),
      refreshMinutes: z.number().int().min(5).max(1440),
      /** After this long without a successful read, the moderators are warned once. */
      staleAfterHours: z.number().int().min(1).max(720),
      /** Post changes of the boss list to the bot-updates channel. */
      announceChanges: z.boolean(),
    })
    .refine((raidBosses) => raidBosses.staleAfterHours * 60 >= 2 * raidBosses.refreshMinutes, {
      error: 'staleAfterHours must cover at least two refresh intervals',
      path: ['staleAfterHours'],
    }),
  /** Raid Hours and Raid Days, during which a boss stays for another time than usual. */
  raidEvents: z.strictObject({
    /** Address of the events feed (`events.min.json` of ScrapedDuck). */
    url: z.url({ protocol: /^https?$/ }),
    refreshHours: z.number().int().min(1).max(168),
    /**
     * The Raid Hour of every week, which needs no feed: ISO weekday (1 is Monday, 3 Wednesday),
     * the hour it starts in `timezone` and how long it lasts. Null when there is none. It is
     * used for a week in which the feed lists no Raid Hour.
     */
    weeklyRaidHour: z
      .strictObject({
        weekday: z.number().int().min(1).max(7),
        hour: z.number().int().min(0).max(23),
        minutes: z.number().int().min(1).max(1440),
      })
      .refine((weekly) => weekly.hour * 60 + weekly.minutes <= 1440, {
        error: 'must end on the day it starts',
        path: ['minutes'],
      })
      .nullable(),
    /** Minutes a boss stays when its egg hatches during such an event. */
    hatchedDuration: z.strictObject({ 'raid-hour': minutes, 'raid-day': minutes }),
  }),
  /**
   * Max battles (plan 8X-2; design `2026-10-20-max-battles-design.md`, section 9). Always on (Matt,
   * 2026-10-21: trains, meetups and raid bosses cannot be switched off either): every key has a
   * default, and a file without the block (one of before, a converted one) has them all.
   * `url` is Pokebattler's raid list (`MAX_BOSS_FEED_URL`, about 700 KB, which asks to be
   * cached: read every `refreshMinutes`, 6 hours unless set), whose `RAID_LEVEL_1_MAX`
   * to `RAID_LEVEL_5_MAX` are the Dynamax bosses and `RAID_LEVEL_6_MAX` the Gigantamax ones.
   * `firstBattle` and `lastBattle` are the hours of the day max battles can be fought, in
   * `timezone` (06:00 and 21:00 unless set): a max battle ends at the last one.
   */
  maxBattles: z
    .strictObject({
      url: z.url({ protocol: /^https?$/ }).default(MAX_BOSS_FEED_URL),
      refreshMinutes: z.number().int().min(5).max(1440).default(360),
      firstBattle: clockTime.default('06:00'),
      lastBattle: clockTime.default('21:00'),
    })
    .refine((max) => max.firstBattle < max.lastBattle, {
      error: 'must be later than firstBattle',
      path: ['lastBattle'],
    })
    .default(() => ({
      url: MAX_BOSS_FEED_URL,
      refreshMinutes: 360,
      firstBattle: '06:00',
      lastBattle: '21:00',
    })),
  /**
   * Field research (plan 8R-1; design `2026-10-21-stop-reports-design.md`, 4.1 and 9.15). Always
   * on, as max battles are: every key has a default, and a file without the block has them all.
   * `url` is Leek Duck's research page (`RESEARCH_URL`), read every `refreshHours` (1 unless
   * set); a list not read anew for `staleAfterHours` (6 unless set) is out of date, which the
   * log says. `throttle` is how many reports a member may make in how many minutes (10 in 30
   * unless set; one report at five stops counts once).
   */
  research: z
    .strictObject({
      url: z.url({ protocol: /^https?$/ }).default(RESEARCH_URL),
      refreshHours: z.number().int().min(1).max(48).default(1),
      staleAfterHours: z.number().int().min(1).max(168).default(6),
      throttle: z
        .strictObject({
          uses: z.number().int().min(1).max(100).default(10),
          minutes: z.number().int().min(1).max(1440).default(30),
        })
        .default(() => ({ uses: 10, minutes: 30 })),
    })
    .refine((research) => research.staleAfterHours >= 2 * research.refreshHours, {
      error: 'staleAfterHours must cover at least two refreshes',
      path: ['staleAfterHours'],
    })
    .default(() => ({
      url: RESEARCH_URL,
      refreshHours: 1,
      staleAfterHours: 6,
      throttle: { uses: 10, minutes: 30 },
    })),
  /**
   * Team GO Rocket (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5). Always on, as field
   * research is: every key has a default. `url` is ScrapedDuck's Rocket lineups
   * (`ROCKET_LINEUPS_URL`), read every `refreshHours` (6 unless set); a list not read anew for
   * `staleAfterHours` (24 unless set, at least two refreshes) is out of date, which the log says.
   * A grunt's message stands `gruntMinutes` (30 unless set). `throttle` is how many reports a
   * member may make in how many minutes (10 in 30 unless set), in a window of its own (design
   * 9.12: `/research`'s numbers, not its window).
   */
  rocket: z
    .strictObject({
      url: z.url({ protocol: /^https?$/ }).default(ROCKET_LINEUPS_URL),
      refreshHours: z.number().int().min(1).max(48).default(6),
      staleAfterHours: z.number().int().min(1).max(336).default(24),
      gruntMinutes: z.number().int().min(5).max(120).default(30),
      throttle: z
        .strictObject({
          uses: z.number().int().min(1).max(100).default(10),
          minutes: z.number().int().min(1).max(1440).default(30),
        })
        .default(() => ({ uses: 10, minutes: 30 })),
    })
    .refine((rocket) => rocket.staleAfterHours >= 2 * rocket.refreshHours, {
      error: 'staleAfterHours must cover at least two refreshes',
      path: ['staleAfterHours'],
    })
    .default(() => ({
      url: ROCKET_LINEUPS_URL,
      refreshHours: 6,
      staleAfterHours: 24,
      gruntMinutes: 30,
      throttle: { uses: 10, minutes: 30 },
    })),
});

/** The settings, with the checks across keys. */
export const settingsSchema = settingsObject.refine(
  (settings) =>
    settings.googleLookupsReserve < settings.googleLookupsPerMonth ||
    (settings.googleLookupsPerMonth === 0 && settings.googleLookupsReserve === 0),
  {
    error: 'must be below googleLookupsPerMonth (both 0 stop the line)',
    path: ['googleLookupsReserve'],
  },
);

export type Settings = z.output<typeof settingsSchema>;

/**
 * The names of the channels the settings name (`settings.channels`), without one left unset
 * (the moderators' channel is optional).
 */
export function channelNamesOf(settings: Pick<Settings, 'channels'>): string[] {
  return Object.values(settings.channels).filter((name) => name !== undefined);
}

export function loadSettings(path: string): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${path} is not valid JSON: ${(err as Error).message}`);
  }
  const result = settingsSchema.safeParse(withoutRetiredSettings(raw));
  if (!result.success) {
    throw new ConfigError(`Invalid settings in ${path}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
