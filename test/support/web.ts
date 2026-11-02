import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { OutgoingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import type { DistanceUnits } from '../../src/render/distance-words.js';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { onTestFinished } from 'vitest';
import type { MemberStanding } from '../../src/discord/member-directory.js';
import type { ServerChannel } from '../../src/domain/regions/region-import.js';
import type { WayspotRow } from '../../src/domain/wayspots/kept.js';
import { RegionDirectory } from '../../src/services/region-directory.js';
import type { OAuthGateway, OAuthUser } from '../../src/web/discord-oauth.js';
import { EditorCache, type EditorSources } from '../../src/web/editor-cache.js';
import { GeoCache, type GeoSources } from '../../src/web/geo-cache.js';
import { MAP_WRITES_PER_MINUTE } from '../../src/web/acting.js';
import { RateLimiter } from '../../src/web/rate-limit.js';
import type { RegionStaffSource, StaffAnswer } from '../../src/web/region-staff.js';
import { LoginLinks } from '../../src/web/login-links.js';
import type { MapServer, MapServers } from '../../src/web/map-servers.js';
import type { WebAssets } from '../../src/web/page.js';
import type { ActingAnswer, ActingMembers, PartyWebDeps } from '../../src/web/party-routes.js';
import type { RaidWebContext, RaidWebDeps } from '../../src/web/raid-routes.js';
import type { SpawnWebContext, SpawnWebDeps } from '../../src/web/spawn-routes.js';
import type { TrainWebContext, TrainWebDeps } from '../../src/web/train-routes.js';
import type { MeetupWebContext, MeetupWebDeps } from '../../src/web/meetup-routes.js';
import type { MaxWebContext, MaxWebDeps } from '../../src/web/max-routes.js';
import type { PostWebContext, PostWebDeps } from '../../src/web/post-control-routes.js';
import type { StopWebContext, StopWebDeps } from '../../src/web/stop-routes.js';
import { Throttles } from '../../src/discord/throttle.js';
import type { Party, Team } from '../../src/domain/party/party.js';
import type { Member } from '../../src/services/attendance-service.js';
import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
import { maxLook } from '../../src/render/max-post.js';
import { inThisThread } from '../../src/web/save-check.js';
import type { RegionEditing } from '../../src/web/editor-save.js';
import { Sessions, sessionHash } from '../../src/web/sessions.js';
import { FAKE_GUILD_ID } from './fake-interactions.js';
import { TEST_ENV } from './test-env.js';
import { gymDirectoryWith } from './gym-store.js';
import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from './gyms.js';
import { FakeMemberDirectory } from './members.js';
import { regionAdminWith } from './region-admin.js';
import { createTestLogger } from './test-logger.js';
import { wayspotsWith } from './wayspots.js';
import { MemoryWebSessions } from './web-sessions.js';
import { MemoryScriptAccess } from './script-access.js';
import { RecordingDms } from './dms.js';
import { toolFolder } from './wayspot-tool.js';
import { WayspotToolFiles } from '../../src/services/wayspot-tool.js';
import { ScriptAccessService } from '../../src/services/script-access-service.js';
import type { ToolWebDeps } from '../../src/web/tool-routes.js';
import type { PostDraws } from '../../src/web/post-drawn.js';
import type { partyServiceWith } from './party-service.js';
import { LiveSignals } from '../../src/web/live-signals.js';
import { MEMBER_LOOKUPS_PER_SECOND } from '../../src/web/paced-members.js';
import { Tally } from './tally.js';

/** The bot's owner in the tests' environment (`TEST_ENV.OWNER_ID`), staff in every server. */
export const TEST_OWNER_ID = TEST_ENV.OWNER_ID ?? '';

/**
 * Where the map's view is built from in tests: the invented gyms (`MemoryGyms` under a real
 * `GymDirectory`) and regions (a real `RegionDirectory` over `regionRows`) of the server of the
 * fake interactions (row 1), whose channels are named `west` and `east` (`channelNames`).
 * Change `regionRows.rows` and load `regions`, or a gym and refresh it in `directory`, as the
 * bot does.
 */
export async function geoSourcesWith() {
  const regionRows = { rows: testRegions() };
  const { gyms, directory } = await gymDirectoryWith(undefined, regionRows);
  const { log } = createTestLogger();
  const regions = new RegionDirectory({
    regions: { listAll: () => Promise.resolve(regionRows.rows) },
    log,
  });
  await regions.load();
  const channelNames = new Map([
    [WEST_CHANNEL, 'west'],
    [EAST_CHANNEL, 'east'],
  ]);
  const sources: GeoSources = {
    guilds: { idFor: (guild) => Promise.resolve(guild === FAKE_GUILD_ID ? 1 : undefined) },
    regions,
    gyms: directory,
    channels: {
      serverChannels: (guild) =>
        guild === FAKE_GUILD_ID ? [...channelNames].map(([id, name]) => ({ id, name })) : undefined,
    },
  };
  return { gyms, directory, regionRows, regions, channelNames, sources };
}

/** A text channel of the fakes' server that is no region, and the category of West and East. */
export const SOUTH_TEXT_CHANNEL = '100000000000000005';
export const TOWN_CATEGORY_ID = '100000000000000041';

/**
 * Where the region editor's view is built from in tests: the sources of `geoSourcesWith` (the
 * invented gyms and regions, `regionRows` to change them), the kept Wayspots of `rows`, and the
 * server's channels as `ServerChannel`s: `west` and `east` in the category `Town`, `south` (no
 * region) and a forum. `servers.serverName` names the server `Pinewood`.
 */
export async function editorSourcesWith(rows: readonly WayspotRow[] = []) {
  const geo = await geoSourcesWith();
  const { wayspots } = await wayspotsWith(rows);
  const channels: ServerChannel[] = [
    { id: TOWN_CATEGORY_ID, name: 'Town', kind: 'category', categoryId: null },
    { id: WEST_CHANNEL, name: 'west', kind: 'text', categoryId: TOWN_CATEGORY_ID },
    { id: EAST_CHANNEL, name: 'east', kind: 'text', categoryId: TOWN_CATEGORY_ID },
    { id: SOUTH_TEXT_CHANNEL, name: 'south', kind: 'text', categoryId: null },
    { id: '100000000000000011', name: 'west-raids', kind: 'forum', categoryId: TOWN_CATEGORY_ID },
  ];
  const sources: EditorSources = {
    guilds: geo.sources.guilds,
    regions: geo.regions,
    gyms: geo.directory,
    wayspots,
    servers: {
      serverChannels: (guild) => (guild === FAKE_GUILD_ID ? channels : undefined),
      serverName: (guild) => (guild === FAKE_GUILD_ID ? 'Pinewood' : undefined),
    },
  };
  return { ...geo, wayspots, channels, sources };
}

/**
 * Who may edit a server's regions, for tests: nobody is staff of anything until `answer` says
 * so (`asStaff` for staff of the fakes' server). `asked` records every question as
 * `<guild>:<user>`; set `failing` to make every question fail, as Discord being away would.
 */
export class FakeRegionStaff implements RegionStaffSource {
  readonly asked: string[] = [];
  failing: Error | undefined;
  private readonly answers = new Map<string, StaffAnswer>();

  answer(userId: string, answer: StaffAnswer, guildId = FAKE_GUILD_ID): this {
    this.answers.set(`${guildId}:${userId}`, answer);
    return this;
  }

  /** Makes somebody staff of the fakes' server (row 1). */
  asStaff(userId: string, mayManageChannels = true): this {
    return this.answer(userId, {
      kind: 'staff',
      staff: { staffId: userId, guildId: 1, server: FAKE_GUILD_ID, mayManageChannels },
    });
  }

  check(guildId: string, userId: string): Promise<StaffAnswer> {
    this.asked.push(`${guildId}:${userId}`);
    if (this.failing) return Promise.reject(this.failing);
    return Promise.resolve(this.answers.get(`${guildId}:${userId}`) ?? { kind: 'not-member' });
  }
}

/** No regions, gyms or Wayspots: the editor of a server that has none. */
const NO_EDITOR: EditorSources = {
  guilds: { idFor: () => Promise.resolve(undefined) },
  regions: { all: () => [], generation: 0 },
  gyms: { all: () => [], regionsOf: () => [], generation: 0 },
  wayspots: { all: () => [], generation: 0 },
  servers: { serverChannels: () => undefined, serverName: () => undefined },
};

/** No regions and no gyms: the map of a server that has none. */
const NOTHING: GeoSources = {
  guilds: { idFor: () => Promise.resolve(undefined) },
  regions: { all: () => [], generation: 0 },
  gyms: { all: () => [], regionsOf: () => [], generation: 0 },
  channels: { serverChannels: () => undefined },
};

/**
 * Who presses a button on the live map, as Discord has them, for tests: nobody is a member of
 * anything until `add` says so; `holdBack` makes a member timed out or not through the
 * membership screening yet (as `DiscordWebMembers` answers for one who is no administrator);
 * `standing` gives a member roles or makes them an administrator (none by default).
 * `asked` records every question as `<guild>:<user>`; set `failing` to make every question
 * fail, as Discord being away would.
 */
export class FakeActingMembers implements ActingMembers {
  readonly asked: string[] = [];
  failing: Error | undefined;
  private readonly members = new Map<string, Member>();
  private readonly held = new Map<string, 'timed-out' | 'pending'>();
  private readonly standings = new Map<string, MemberStanding>();

  /** A member's roles by name and whether they are an administrator, from now on. */
  standing(userId: string, standing: MemberStanding, guildId = FAKE_GUILD_ID): this {
    this.standings.set(`${guildId}:${userId}`, standing);
    return this;
  }

  /** Makes somebody a member of a server (default: the server of the fake interactions). */
  add(userId: string, name: string, team?: Team, guildId = FAKE_GUILD_ID): this {
    this.members.set(`${guildId}:${userId}`, { id: userId, name, ...(team ? { team } : {}) });
    this.held.delete(`${guildId}:${userId}`);
    return this;
  }

  /** A member is timed out, or has not finished the server's membership screening. */
  holdBack(userId: string, why: 'timed-out' | 'pending', guildId = FAKE_GUILD_ID): this {
    this.held.set(`${guildId}:${userId}`, why);
    return this;
  }

  /** Somebody leaves a server. */
  remove(userId: string, guildId = FAKE_GUILD_ID): void {
    this.members.delete(`${guildId}:${userId}`);
    this.held.delete(`${guildId}:${userId}`);
    this.standings.delete(`${guildId}:${userId}`);
  }

  acting(guildId: string, userId: string): Promise<ActingAnswer> {
    this.asked.push(`${guildId}:${userId}`);
    if (this.failing) return Promise.reject(this.failing);
    const key = `${guildId}:${userId}`;
    const member = this.members.get(key);
    if (!member) return Promise.resolve({ kind: 'not-member' });
    const held = this.held.get(key);
    const standing = this.standings.get(key) ?? { roleNames: [], administrator: false };
    return Promise.resolve(
      held ? { kind: held } : { kind: 'member', member: { ...member }, standing },
    );
  }
}

const noAttendance = (): Promise<never> =>
  Promise.reject(new Error('no parties in this test: give partyWebWith'));

/** No place has a picture the map serves (plan 8M-8A): a test that needs one passes `places`. */
const NO_PLACES: PartyWebDeps['places'] = {
  keyOf: () => undefined,
  urlOf: () => undefined,
  read: () => Promise.resolve(undefined),
};

/** Nothing waits for a post to be drawn (plan 8M-11A): a test of the wait passes its own. */
export const NO_DRAW_WAIT: PostDraws = {
  drawTicket: () => 0,
  shown: () => Promise.resolve(),
};

/**
 * The draws of the posts as a route asks for them (plan 8M-11A, S1), answered at once: each
 * ticket keeps the party as the store had it when it was taken (`at`), each wait what it
 * waited for (`waits`: the party, the party at its ticket, the cap).
 */
export class RecordingDraws implements PostDraws {
  readonly waits: { partyId: string; at: Party | undefined; maxMs: number }[] = [];
  private readonly tickets = new Map<number, Party | undefined>();

  constructor(private readonly store: { get(partyId: string): Party | undefined }) {}

  drawTicket(partyId: string): number {
    const ticket = this.tickets.size + 1;
    this.tickets.set(ticket, this.store.get(partyId));
    return ticket;
  }

  shown(partyId: string, ticket: number, maxMs: number): Promise<void> {
    this.waits.push({ partyId, at: this.tickets.get(ticket), maxMs });
    return Promise.resolve();
  }
}

/** No parties: the live map of a server without any. */
const NO_PARTIES: PartyWebDeps = {
  guilds: { idFor: () => Promise.resolve(undefined) },
  store: { active: () => [], get: () => undefined, raidAt: () => undefined },
  look: () => ({}),
  stops: () => {
    throw new Error('no trains in this test');
  },
  layoutOf: () => undefined,
  drawn: NO_DRAW_WAIT,
  titleOf: () => '',
  places: NO_PLACES,
  forums: { memberAccess: () => Promise.resolve(undefined) },
  zone: 'America/New_York',
  attendance: {
    signUp: noAttendance,
    joinInto: noAttendance,
    joinChosen: noAttendance,
    done: noAttendance,
    leave: noAttendance,
    setRemote: noAttendance,
    changeNumber: noAttendance,
    answer: noAttendance,
    joinStamped: noAttendance,
    setMeetingTime: noAttendance,
    limits: () => {
      throw new Error('no parties in this test: give partyWebWith');
    },
    lobbyOf: () => {
      throw new Error('no parties in this test: give partyWebWith');
    },
  },
  acting: new FakeActingMembers(),
  throttles: new Throttles(),
  ownerId: TEST_OWNER_ID,
  closing: { mayDeletePost: () => false, channelName: () => undefined },
};

/**
 * The live map's parties over the party services of a test (`partyServiceWith`, `reportedRaid`,
 * `reportedMax` and the like), as the bot wires them: the store, the attendance service, the fake
 * gateway's forums, how the party service shows a raid and a max battle, the server of the fake
 * interactions as row 1.
 * Pass as `parties`. Who presses is `acting` (nobody by default); the window of the post's
 * controls is `throttles` (one of the test's, to share with a router or fill beforehand).
 */
export function partyWebWith(
  made: Pick<
    Awaited<ReturnType<typeof partyServiceWith>>,
    'gateway' | 'store' | 'service' | 'settings' | 'attendance'
  >,
  options: {
    acting?: ActingMembers;
    throttles?: Throttles;
    places?: PartyWebDeps['places'];
    drawn?: PostDraws;
  } = {},
): PartyWebDeps {
  return {
    guilds: {
      idFor: (snowflake) => Promise.resolve(snowflake === made.gateway.guildId ? 1 : undefined),
    },
    store: made.store,
    look: (raid) => made.service.raidLookOf(raid),
    stops: made.service.stops,
    maxLook: (party) => maxLook(made.service.maxView(party)),
    layoutOf: (partyId) => made.service.layoutOf(partyId),
    // Nothing waits for a post unless the test says so (`RecordingDraws`, or the service).
    drawn: options.drawn ?? NO_DRAW_WAIT,
    titleOf: (party) => made.service.postTitle(party),
    places: options.places ?? NO_PLACES,
    forums: made.gateway,
    zone: made.settings.timezone,
    attendance: made.attendance,
    acting: options.acting ?? new FakeActingMembers(),
    throttles: options.throttles ?? new Throttles(),
    ownerId: TEST_OWNER_ID,
    // Staff's Delete… (plan 8M-8B): the fake gateway says where the bot may delete posts.
    closing: {
      mayDeletePost: (partyId) => made.service.mayDeletePost(partyId),
      channelName: (channelId) => made.gateway.channelName(channelId),
    },
  };
}

/**
 * Staff's Delete… and the report to the moderators on the map over a test's context
 * (`createTestContext` with the party service of `partyServiceWith` or `reportedRaid`, and its
 * `reports`; or `reportsWith`'s service and reports), as the bot wires it (plan 8M-8B). Pass as
 * `posts`. `staffRoles` gives the server's staff roles a report pings where there is no
 * moderators' channel (none by default).
 */
export function postWebWith(
  ctx: PostWebContext,
  options: Partial<Omit<PostWebDeps, 'ctx'>> = {},
): PostWebDeps {
  return { ctx, staffRoles: () => [], ...options };
}

/** Nothing is closed or reported on the map: a test that does passes `postWebWith`. */
const NO_POSTS: PostWebDeps = {
  ctx: new Proxy({} as PostWebContext, {
    get(_target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined;
      throw new Error('no closing or reports in this test: give postWebWith');
    },
  }),
  staffRoles: () => [],
};

/**
 * Reporting and changing raids on the map over a test's context (`createTestContext`, with the
 * party services of `partyServiceWith` for a report or a change), as the bot wires it. Pass as
 * `raids`. `channelName` names the channels the bot sees (none by default).
 */
export function raidWebWith(
  ctx: RaidWebContext,
  options: Partial<Omit<RaidWebDeps, 'ctx'>> = {},
): RaidWebDeps {
  return { ctx, channelName: () => undefined, ...options };
}

/** No raids can be reported or changed: a test that does passes `raidWebWith`. */
const NO_RAIDS: RaidWebDeps = {
  ctx: new Proxy({} as RaidWebContext, {
    get(_target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined;
      throw new Error('no raids in this test: give raidWebWith');
    },
  }),
  channelName: () => undefined,
};

/**
 * Reporting wild Pokémon on the map over a test's context (`createTestContext`, with the spawn
 * service, wants and regions of `partyServiceWith`), as the bot wires it. Pass as `spawns`.
 * `channelName` names the channels the bot sees (none by default); `channels` says who an
 * overwrite of their own keeps out of a region's channel (give the fake gateway; nobody by
 * default).
 */
export function spawnWebWith(
  ctx: SpawnWebContext,
  options: Partial<Omit<SpawnWebDeps, 'ctx'>> = {},
): SpawnWebDeps {
  return { ctx, channelName: () => undefined, channels: NOBODY_KEPT_OUT, ...options };
}

/**
 * Starting, arranging and moving trains on the map over a test's context (`createTestContext`,
 * with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of
 * `partyServiceWith` or `createdTrain`), as the bot wires it. Pass as `trains`. `channelName`
 * names the channels the bot sees (none by default).
 */
export function trainWebWith(
  ctx: TrainWebContext,
  options: Partial<Omit<TrainWebDeps, 'ctx'>> = {},
): TrainWebDeps {
  return { ctx, channelName: () => undefined, ...options };
}

/** No trains can be started or changed: a test that does passes `trainWebWith`. */
const NO_TRAINS: TrainWebDeps = {
  ctx: new Proxy({} as TrainWebContext, {
    get(_target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined;
      throw new Error('no trains in this test: give trainWebWith');
    },
  }),
  channelName: () => undefined,
};

/**
 * Making and changing meetups on the map over a test's context (`createTestContext`, with
 * `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of
 * `meetupSafetyWith`, and `wayspots` for the stops), as the bot wires it. Pass as `meetups`.
 * `channelName` names the channels the bot sees (none by default).
 */
export function meetupWebWith(
  ctx: MeetupWebContext,
  options: Partial<Omit<MeetupWebDeps, 'ctx'>> = {},
): MeetupWebDeps {
  return { ctx, channelName: () => undefined, ...options };
}

/** No meetups can be made or changed: a test that does passes `meetupWebWith`. */
const NO_MEETUPS: MeetupWebDeps = {
  ctx: new Proxy({} as MeetupWebContext, {
    get(_target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined;
      throw new Error('no meetups in this test: give meetupWebWith');
    },
  }),
  channelName: () => undefined,
};

/**
 * Reporting max battles on the map over a test's context (`maxReportingWith`'s, or
 * `createTestContext` with the party services, the max bosses, the events, the kept power spots
 * and meetup safety), as the bot wires it. Pass as `maxes`. `channelName` names the channels the
 * bot sees (none by default).
 */
export function maxWebWith(
  ctx: MaxWebContext,
  options: Partial<Omit<MaxWebDeps, 'ctx'>> = {},
): MaxWebDeps {
  return { ctx, channelName: () => undefined, ...options };
}

/** No max battles can be reported: a test that does passes `maxWebWith`. */
const NO_MAXES: MaxWebDeps = {
  ctx: new Proxy({} as MaxWebContext, {
    get(_target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined;
      throw new Error('no max battles in this test: give maxWebWith');
    },
  }),
  channelName: () => undefined,
};

/**
 * Reports at stops on the map over a test's context (`stopReportingWith`'s), as the bot wires
 * it (plan 8R-3). Pass as `stops`. `channelName` names the channels the bot sees (none by
 * default); `posts` says which message of a pinned post holds a task (none by default);
 * `grunts` reads the grunts' messages (give `stopReportingWith`'s; none by default).
 */
export function stopWebWith(
  ctx: StopWebContext,
  options: Partial<Omit<StopWebDeps, 'ctx'>> = {},
): StopWebDeps {
  return { ctx, channelName: () => undefined, posts: undefined, grunts: undefined, ...options };
}

/** No reports at stops: a test that has them passes `stopWebWith`. */
const NO_STOPS: StopWebDeps = {
  ctx: new Proxy({} as StopWebContext, {
    get(_target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined;
      throw new Error('no reports at stops in this test: give stopWebWith');
    },
  }),
  channelName: () => undefined,
  posts: undefined,
  grunts: undefined,
};

/** No overwrite of a member's own keeps anybody out of a channel. */
const NOBODY_KEPT_OUT: SpawnWebDeps['channels'] = { ownViewDenied: () => Promise.resolve(false) };

/** No spawns can be reported: a test that does passes `spawnWebWith`. */
const NO_SPAWNS: SpawnWebDeps = {
  ctx: new Proxy({} as SpawnWebContext, {
    get(_target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined;
      throw new Error('no spawns in this test: give spawnWebWith');
    },
  }),
  channelName: () => undefined,
  channels: NOBODY_KEPT_OUT,
};

/** The web settings of the tests: a public address of its own, OpenStreetMap's tiles. */
export const TEST_WEB: WebSettings = {
  port: 0,
  host: '127.0.0.1',
  publicUrl: 'https://map.example.test',
  trustProxy: false,
  tiles: 'osm',
};

/** The application id of the tests' environment (`TEST_ENV.DISCORD_APP_ID`). */
export const TEST_APP_ID = '123456789012345678';

/** The time the web tests start at (2026-10-16 12:00 UTC); move `clock.now` to pass time. */
export const WEB_START = Date.UTC(2026, 9, 16, 12);

/**
 * Discord's side of a login, for tests: the codes it knows and whose they are. `exchanged`
 * records every exchange; `whoFails` makes the question who a token is fail.
 */
export class FakeOAuth implements OAuthGateway {
  readonly exchanged: Array<{ code: string; redirectUri: string }> = [];
  whoFails = false;
  private readonly codes = new Map<string, OAuthUser>();

  /** A code Discord would give for this member. */
  knows(code: string, user: OAuthUser): this {
    this.codes.set(code, user);
    return this;
  }

  exchange(code: string, redirectUri: string) {
    this.exchanged.push({ code, redirectUri });
    return Promise.resolve(
      this.codes.has(code) ? { accessToken: `token:${code}` } : { failed: 'status 400' },
    );
  }

  who(accessToken: string) {
    const user = this.codes.get(accessToken.replace(/^token:/, ''));
    if (this.whoFails || !user) return Promise.resolve({ failed: 'status 401' });
    return Promise.resolve({ ...user });
  }
}

/** The `Set-Cookie` headers of an answer of `inject`, as one list. */
export function setCookies(answer: { headers: OutgoingHttpHeaders }): string[] {
  const value = answer.headers['set-cookie'];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [String(value)];
}

/** The cookie an answer sets, by name: `name=value`, for the next request's `cookie` header. */
export function cookieOf(answer: { headers: OutgoingHttpHeaders }, name: string): string {
  const found = setCookies(answer).find((cookie) => cookie.startsWith(`${name}=`));
  if (!found) throw new Error(`no ${name} cookie`);
  return found.split(';')[0] ?? '';
}

/** What a test may change of the web server it builds. */
export interface WebTestOptions {
  /** Changes of `TEST_WEB`. */
  web?: Partial<WebSettings>;
  servers?: WebDeps['servers'];
  /**
   * The servers with a map, which the top page names (plan 8M-14): a list of servers available,
   * or with those unavailable apart (`MapServers`); none by default.
   */
  serversWithMap?: MapServer[] | MapServers | WebDeps['serversWithMap'];
  /**
   * The members of servers; nobody is a member of anything by default. With `holds`, a page's asks
   * of members it does not hold wait in the paced queue, on `liveTimers` (none does without it).
   */
  members?: WebDeps['members'];
  /** Discord's side of a login (a `FakeOAuth` by default); undefined: no client secret. */
  oauth?: OAuthGateway | undefined;
  googleKey?: string;
  /** `settings.distanceUnits`; imperial by default, as the settings' own. */
  distanceUnits?: DistanceUnits;
  /** Where the map's view is built from (`geoSourcesWith`); nothing by default. */
  geo?: { sources: GeoSources };
  /** The built bundle (`builtAssets`); by default none was built. */
  assets?: WebAssets;
  /** Who may edit a server's regions; nobody by default. */
  staff?: RegionStaffSource;
  /** Where the editor's view is built from (`editorSourcesWith`); nothing by default. */
  editor?: { sources: EditorSources };
  /**
   * The region administration of preview and save (`regionEditingWith`); by default none,
   * which a test that saves must give.
   */
  editing?: RegionEditing;
  /** Whether the web server is closing (the bot shutting down); never by default. */
  closing?: () => boolean;
  /** The live map's parties (`partyWebWith`); none by default. */
  parties?: PartyWebDeps;
  /** Reporting and changing raids on the map (`raidWebWith`); none by default. */
  raids?: RaidWebDeps;
  /** Reporting wild Pokémon on the map (`spawnWebWith`); none by default. */
  spawns?: SpawnWebDeps;
  /** Starting, arranging and moving trains on the map (`trainWebWith`); none by default. */
  trains?: TrainWebDeps;
  /** Making and changing meetups on the map (`meetupWebWith`); none by default. */
  meetups?: MeetupWebDeps;
  /** The writes a member may send in a minute; the map's own by default. */
  mapWrites?: RateLimiter;
  /** Max battles on the map: power spots, pick lists, reports (`maxWebWith`); none by default. */
  maxes?: MaxWebDeps;
  /** Reports at stops on the map (`stopWebWith`); none by default. */
  stops?: StopWebDeps;
  /** Staff's Delete… and reports to the moderators on the map (`postWebWith`); none by default. */
  posts?: PostWebDeps;
  /** The Wayspot export tool and who may have it (`toolWebWith`); no tool file by default. */
  tool?: ToolWebDeps;
  /**
   * The square pictures of the stops (plan 8R-6): none made by default, and every source named
   * as it is.
   */
  pictures?: Partial<WebDeps['pictures']>;
  /** The application emoji's pictures (plan 8M-8A): none by default. */
  emoji?: WebDeps['emoji'];
}

/**
 * The Wayspot export tool over a folder of the test's (`toolFolder`: the small tool file of
 * `toolText` and `TOOL_CHANGELOG` unless `script` or `changelog` say otherwise, null for none),
 * who may have it through a `ScriptAccessService` (`access`) over rows in memory (`store`, a
 * `MemoryScriptAccess`) on a clock of its own (`clock`, from `WEB_START`), the owner `ownerId`
 * (`TEST_OWNER_ID` by default), told of new requests in `dms` (a `RecordingDms`), and the zone
 * of the posts. Pass as `tool`.
 */
export function toolWebWith(options: Parameters<typeof toolFolder>[0] & { ownerId?: string } = {}) {
  const folder = toolFolder(options);
  const store = new MemoryScriptAccess();
  const clock = { now: WEB_START };
  const { log, entries } = createTestLogger();
  const dms = new RecordingDms();
  const access = new ScriptAccessService({
    store,
    ownerId: options.ownerId ?? TEST_OWNER_ID,
    now: () => clock.now,
    log,
    dms,
  });
  const tool: ToolWebDeps = {
    files: new WayspotToolFiles({ dir: folder.dir, log }),
    access,
    zone: 'America/New_York',
  };
  return { ...tool, store, clock, folder, entries, dms };
}

/** No tool file: every address of the tool answers 404, as on any instance but the owner's. */
const NO_TOOL: ToolWebDeps = {
  files: { read: () => Promise.resolve(undefined) },
  access: new ScriptAccessService({
    store: new MemoryScriptAccess(),
    ownerId: TEST_OWNER_ID,
    log: createTestLogger().log,
  }),
  zone: 'America/New_York',
};

/**
 * Preview and save over region administration on fakes (`regionAdminWith`: the invented regions
 * West, East and the one without an outline, the channels `west`, `east`, `unbounded` in `Town`
 * and `south`), as the bot wires them, but for the new overlaps and gaps of a save, which are
 * worked out on the test's own thread (`inThisThread`).
 */
export async function regionEditingWith(selfRoles = false) {
  const made = await regionAdminWith();
  const editing: RegionEditing = {
    regions: made.regions,
    admin: made.regionAdmin,
    checker: inThisThread,
    selfRoles,
    log: made.log,
  };
  return { ...made, editing };
}

/** No region administration: a test of preview or save gives its own (`regionEditingWith`). */
const NO_EDITING: RegionEditing = {
  regions: { all: () => [] },
  admin: {
    preview: () => {
      throw new Error('no region administration in this test');
    },
    save: () => Promise.reject(new Error('no region administration in this test')),
    removalQuestion: () => Promise.resolve(undefined),
    channelsOf: () => [],
    orphanForums: () => Promise.resolve([]),
  },
  checker: inThisThread,
  selfRoles: false,
  log: createTestLogger().log,
};

/**
 * A bundle as `npm run web:build` leaves it, in a folder of its own: the script and style with
 * hashes in their names, a file without one, and a file beside the folder that must not be
 * reached through it. Call it inside a test: the folder is removed when that test is over.
 */
export function builtAssets(): WebAssets {
  const root = mkdtempSync(path.join(tmpdir(), 'pine-web-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  });
  const dir = path.join(root, 'assets');
  mkdirSync(dir);
  writeFileSync(path.join(dir, 'map-ABCDEFGH.js'), 'console.log("map");');
  writeFileSync(path.join(dir, 'map-IJKLMNOP.css'), 'body { margin: 0; }');
  writeFileSync(path.join(dir, 'theme-STUVWXYZ.js'), 'console.log("theme");');
  writeFileSync(path.join(dir, 'editor-QRSTUVWX.js'), 'console.log("editor");');
  writeFileSync(path.join(dir, 'editor-YZABCDEF.css'), 'body { margin: 0; }');
  writeFileSync(path.join(dir, 'editor-worker-GHIJKLMN.js'), 'console.log("worker");');
  writeFileSync(path.join(dir, 'userscript-OPQRSTUV.js'), 'console.log("tool");');
  writeFileSync(path.join(dir, 'userscript-WXYZABCD.css'), 'body { margin: 0; }');
  writeFileSync(path.join(dir, 'notes.txt'), 'notes');
  writeFileSync(path.join(root, 'assets.json'), '{}');
  return {
    dir,
    manifest: {
      map: { script: 'map-ABCDEFGH.js', style: 'map-IJKLMNOP.css', theme: 'theme-STUVWXYZ.js' },
      editor: {
        script: 'editor-QRSTUVWX.js',
        style: 'editor-YZABCDEF.css',
        worker: 'editor-worker-GHIJKLMN.js',
      },
      userscript: { script: 'userscript-OPQRSTUV.js', style: 'userscript-WXYZABCD.css' },
    },
  };
}

/** A web server built as the bot builds it, over fakes; `entries` is what it logged. */
export interface TestWeb {
  app: FastifyInstance;
  log: Logger;
  entries: Array<Record<string, unknown>>;
  clock: { now: number };
  /** The hub of the live streams, on the clock and `liveTimers`; `random` 0 (no jitter). */
  live: LiveSignals;
  /** The timers of `live`, which run only when `pass` moves the clock on over them. */
  liveTimers: { pass(ms: number): void };
  /** A stream forgotten because its client went, as a count to wait for (`/api/live`). */
  liveGone: Tally;
  /** The stored sessions. */
  sessions: MemoryWebSessions;
  sessionService: Sessions;
  loginLinks: LoginLinks;
  /** Starts a session for somebody, as a login does; gives the `cookie` header that carries it. */
  loggedIn(userId: string, name: string): Promise<string>;
  /**
   * Starts a session for somebody and gives the headers a POST of Pine's own page carries: the
   * cookie, `Origin` and the session's CSRF token.
   */
  posting(userId: string, name: string): Promise<Record<string, string>>;
}

/**
 * The servers with a map of a test: a list as the servers available, the servers and those
 * unavailable as they are, a function as it is, else none.
 */
function serversWithMapOf(given: WebTestOptions['serversWithMap']): WebDeps['serversWithMap'] {
  if (typeof given === 'function') return given;
  const { servers, unavailable } = Array.isArray(given)
    ? { servers: given, unavailable: [] }
    : (given ?? { servers: [], unavailable: [] });
  return () =>
    Promise.resolve({
      servers: servers.map((server) => ({ ...server })),
      unavailable: [...unavailable],
    });
}

/** Timers on a test's clock, which run only when `pass` moves it on over them. */
class HandTimers {
  private readonly timers = new Set<{ at: number; run: () => void }>();

  constructor(private readonly clock: { now: number }) {}

  setTimer = (run: () => void, ms: number): (() => void) => {
    const timer = { at: this.clock.now + ms, run };
    this.timers.add(timer);
    return () => {
      this.timers.delete(timer);
    };
  };

  pass(ms: number): void {
    const until = this.clock.now + ms;
    for (;;) {
      const next = [...this.timers]
        .filter((timer) => timer.at <= until)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.timers.delete(next);
      this.clock.now = next.at;
      next.run();
    }
    this.clock.now = until;
  }
}

function membersForEditor(staff: RegionStaffSource | undefined): FakeMemberDirectory {
  const members = new FakeMemberDirectory();
  if (staff !== undefined) {
    members.find = (_guildId, userId) => Promise.resolve({ id: userId, name: 'Member' });
  }
  return members;
}

/**
 * The web server over fakes: the bot is in the server of the fake interactions alone, unless
 * `servers` says otherwise; sessions in memory, on a clock of the test's. Close `app` after the
 * test.
 */
export function webServerWith(options: WebTestOptions = {}): TestWeb {
  const { log, entries } = createTestLogger();
  const clock = { now: WEB_START };
  const liveTimers = new HandTimers(clock);
  const live = new LiveSignals({
    now: () => clock.now,
    setTimer: liveTimers.setTimer,
    random: () => 0,
  });
  const liveGone = new Tally('a live stream gone');
  const openStream = live.open.bind(live);
  live.open = (opening) => {
    const answer = openStream(opening);
    if (answer.kind !== 'open') return answer;
    return {
      kind: 'open',
      gone: () => {
        answer.gone();
        liveGone.add();
      },
    };
  };
  const settings = { ...TEST_WEB, ...options.web };
  const sessions = new MemoryWebSessions();
  const sessionService = new Sessions({
    store: sessions,
    secure: settings.publicUrl.startsWith('https:'),
    now: () => clock.now,
  });
  const loginLinks = new LoginLinks();
  const gateway = 'oauth' in options ? options.oauth : new FakeOAuth();
  const app = buildWebServer({
    settings,
    // As the bot's: the feeds' host and its own address, whose /pictures/ and /eggs/ posts show.
    pictureOrigins: ['https://cdn.leekduck.com', settings.publicUrl],
    googleKey: options.googleKey,
    distanceUnits: options.distanceUnits ?? 'imperial',
    servers: options.servers ?? { has: (guildId) => guildId === FAKE_GUILD_ID },
    serversWithMap: serversWithMapOf(options.serversWithMap),
    // Those a test of the region editor names by `staff` are not listed as members as well: the
    // editor asks the directory first (plan 8Z), and a test of that gives its own.
    members: options.members ?? membersForEditor(options.staff),
    memberPace: { perSecond: MEMBER_LOOKUPS_PER_SECOND, setTimer: liveTimers.setTimer },
    mapWrites: options.mapWrites ?? new RateLimiter({ uses: MAP_WRITES_PER_MINUTE, perMs: 60_000 }),
    sessions: sessionService,
    oauth: gateway && { appId: TEST_APP_ID, gateway },
    loginLinks,
    geo: new GeoCache(options.geo?.sources ?? NOTHING),
    assets: options.assets ?? { dir: path.join(tmpdir(), 'pine-web-none'), manifest: undefined },
    editor: {
      staff: options.staff ?? new FakeRegionStaff(),
      view: new EditorCache(options.editor?.sources ?? NO_EDITOR),
      editing: options.editing ?? NO_EDITING,
      closing: options.closing ?? (() => false),
    },
    parties: options.parties ?? NO_PARTIES,
    raids: options.raids ?? NO_RAIDS,
    spawns: options.spawns ?? NO_SPAWNS,
    trains: options.trains ?? NO_TRAINS,
    meetups: options.meetups ?? NO_MEETUPS,
    maxes: options.maxes ?? NO_MAXES,
    stops: options.stops ?? NO_STOPS,
    posts: options.posts ?? NO_POSTS,
    tool: options.tool ?? NO_TOOL,
    pictures: {
      read: () => Promise.resolve(undefined),
      url: (source) => source,
      ...options.pictures,
    },
    emoji: options.emoji ?? {
      address: () => undefined,
      read: () => Promise.resolve(undefined),
    },
    live,
    now: () => clock.now,
    log,
  });
  return {
    app,
    log,
    entries,
    clock,
    live,
    liveTimers,
    liveGone,
    sessions,
    sessionService,
    loginLinks,
    async loggedIn(userId, name) {
      const token = await sessionService.create({ id: userId, name });
      return `${sessionService.cookieName}=${token}`;
    },
    async posting(userId, name) {
      const token = await sessionService.create({ id: userId, name });
      return {
        cookie: `${sessionService.cookieName}=${token}`,
        origin: settings.publicUrl,
        'x-pine-csrf': sessionService.csrfToken({ id: sessionHash(token) }),
      };
    },
  };
}
