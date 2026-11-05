import type { Kysely } from 'kysely';
import type { AppContext } from '../../src/app-context.js';
import { Throttles } from '../../src/discord/throttle.js';
import { loadEnv } from '../../src/config/env.js';
import { loadSettings } from '../../src/config/settings.js';
import { ClickAnswers } from '../../src/discord/click-answers.js';
import type { DB } from '../../src/db/types.js';
import type { AttendanceService } from '../../src/services/attendance-service.js';
import type { GymAdminService } from '../../src/services/gym-admin-service.js';
import type { PokemonNicknames } from '../../src/services/pokemon-search-service.js';
import type { RaidBossAdmin } from '../../src/services/raid-boss-service.js';
import type { PartyService } from '../../src/services/party-service.js';
import { PlaceFinder } from '../../src/services/place-finder.js';
import { PineStopService } from '../../src/services/pine-stops.js';
import { WayspotDirectory } from '../../src/services/wayspot-directory.js';
import { MemoryPineStops } from './pine-stops.js';
import { StopReportService } from '../../src/services/stop-reports.js';
import { rewardHash } from '../../src/domain/research/versions.js';
import type { RegionTallies } from '../../src/services/region-tallies.js';
import { RocketService } from '../../src/services/rocket-reports.js';
import { MemoryStopReports } from './stop-reports.js';
import type { RaidChangeService } from '../../src/services/raid-change-service.js';
import type { RegionAdminService } from '../../src/services/region-admin-service.js';
import type { LegacyCleanup } from '../../src/services/legacy-cleanup.js';
import type { Screenshots } from '../../src/services/screenshot-service.js';
import type { SpawnService } from '../../src/services/spawn-service.js';
import type { TimedPartyService } from '../../src/services/timed-party-service.js';
import type { TrainService } from '../../src/services/train-service.js';
import type { WayfarerImportService } from '../../src/services/wayfarer-import-service.js';
import type { WayfarerReviewService } from '../../src/services/wayfarer-review-service.js';
import { FakeAttachments } from './attachments.js';
import { FAKE_GUILD_ID } from './fake-interactions.js';
import { catalogueFixture } from './game-data.js';
import { FakeMemberDirectory } from './members.js';
import { RecordingDms } from './dms.js';
import { MemoryHistoryOptIns } from './history.js';
import { MemoryNewTrains } from './new-trains.js';
import { noParties } from './parties.js';
import { FakeIssues } from './issues.js';
import { FakePokebattler } from './pokebattler.js';
import { FakePlaces } from './places.js';
import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
import type { MaxBossAdmin, MaxBossProvider } from '../../src/services/max-boss-service.js';
import type { MaxChangeService } from '../../src/services/max-change-service.js';
import { raidBossesFixture } from './raid-bosses.js';
import { raidEventsFixture } from './raid-events.js';
import { researchTasksFixture } from './research.js';
import { rocketLineupsFixture } from './rocket.js';
import { selfRolesWith } from './roles.js';
import { createTestLogger } from './test-logger.js';
import { TEST_SETTINGS_PATH } from './test-settings.js';
import { MemoryGymTargets } from './gym-targets.js';
import { TEST_ENV } from './test-env.js';
import { unavailableReader } from './screenshots.js';
import { MemoryUsers } from './users.js';
import { MemoryWants } from './wants.js';
import { MemoryTargetWants } from './target-wants.js';
import { MemoryWantBoxes } from './want-boxes.js';
import type { WantBoxStorage } from '../../src/db/repositories/want-box-repository.js';
import { noWayspots } from './wayspots.js';
import type { WayspotAddresses } from '../../src/services/wayspot-addresses.js';
import { LoginLinks } from '../../src/web/login-links.js';
import { MeetupSafety } from '../../src/services/meetup-safety.js';
import type { PartyGateway } from '../../src/discord/party-gateway.js';
import { MemoryMeetupSafety } from './meetup-safety.js';
import { ModerationReports } from '../../src/services/moderation-reports.js';
import { MemoryReports } from './reports.js';
import { MemoryScriptAccess } from './script-access.js';
import { ScriptAccessService } from '../../src/services/script-access-service.js';

export { TEST_SETTINGS_PATH };

/** For a part of the context most tests do not need: using it says how to provide it. */
function unavailable<T extends object>(name: string, hint: string): T {
  // What a failed assertion, a promise or a test runner asks of any value must not throw, so that
  // printing the context shows the assertion's own message.
  const probed = new Set(['toJSON', 'then', '$$typeof', 'asymmetricMatch', 'nodeType']);
  return new Proxy({} as T, {
    get(_target, property) {
      if (typeof property === 'symbol' || probed.has(property)) return undefined;
      throw new Error(`This test context has no ${name}; ${hint}`);
    },
  });
}

/** Max bosses of a test that names none: no boss, nothing coming, nothing hidden. */
export const NO_MAX_BOSSES: MaxBossProvider = {
  bosses: () => [],
  coming: () => [],
  hidden: () => [],
  feedBosses: () => [],
};

/** An AppContext with real settings, the test env, a capturing logger and no database. */
export function createTestContext(overrides: Partial<AppContext> = {}) {
  const { log, entries } = createTestLogger();
  const gameData = overrides.gameData ?? { catalogue: catalogueFixture() };
  const ctx: AppContext = {
    config: { settings: loadSettings(TEST_SETTINGS_PATH), env: loadEnv(TEST_ENV) },
    log,
    db: {} as Kysely<DB>,
    commands: [],
    messageCommands: [],
    gameData,
    raidBosses: raidBossesFixture(),
    raidBossAdmin: unavailable<RaidBossAdmin>(
      'raidBossAdmin',
      'pass { raidBosses: service, raidBossAdmin: service } from raidBossServiceWith()',
    ),
    // No max boss, unless a test passes { maxBosses: service, maxBossAdmin: service } from
    // maxBossServiceWith().
    maxBosses: NO_MAX_BOSSES,
    maxBossAdmin: unavailable<MaxBossAdmin>(
      'maxBossAdmin',
      'pass { maxBosses: service, maxBossAdmin: service } from maxBossServiceWith()',
    ),
    raidEvents: raidEventsFixture(),
    // The task list of Leek Duck's page of 2026-10-21; a test passes its own to change it.
    researchTasks: researchTasksFixture(),
    // No event's spawns (plan 8R-4); a test passes its own `sightingsAt`.
    eventSpawns: { sightingsAt: () => [] },
    // The Rocket lineups of ScrapedDuck's feed of 2026-10-22; a test passes its own to change them.
    rocketLineups: rocketLineupsFixture(),
    // Over memory and the context's own research events (below), unless a test passes its own.
    stopReports: undefined as unknown as StopReportService,
    // No post of the stops holds anything; a test passes its own `linkOf`.
    stopPostLinks: { linkOf: () => undefined },
    // Over the context's reports (below), unless a test passes its own.
    rocket: undefined as unknown as RocketService,
    gyms: gymsFixture(),
    gymAdmin: unavailable<GymAdminService>(
      'gymAdmin',
      'pass { gymAdmin: admin, gyms: directory, … } from gymAdminWith()',
    ),
    wayfarer: unavailable<WayfarerImportService>(
      'wayfarer',
      'pass { wayfarer, gymAdmin: admin, gyms: directory, … } from wayfarerImportWith()',
    ),
    wayfarerReview: unavailable<WayfarerReviewService>(
      'wayfarerReview',
      'pass { wayfarerReview, gymAdmin: admin, gyms: directory, … } from wayfarerImportWith()',
    ),
    regions: regionsFixture(),
    // No Wayspot is kept; a test passes its own directory (`wayspotsWith`, or wayfarerImportWith).
    wayspots: noWayspots(),
    wayspotAddresses: unavailable<WayspotAddresses>(
      'wayspotAddresses',
      'pass { wayspotAddresses: addresses, wayspots } from wayspotAddressesWith() and wayspotsWith()',
    ),
    regionAdmin: unavailable<RegionAdminService>(
      'regionAdmin',
      'pass { regionAdmin, regions, gyms: directory, … } from regionAdminWith()',
    ),
    legacyCleanup: unavailable<LegacyCleanup>(
      'legacyCleanup',
      'pass { legacyCleanup: new LegacyCleanup({ rest: () => api, … }) } over a FakeDiscordApi',
    ),
    // No attachment can be downloaded; a test passes its own with files.
    attachments: new FakeAttachments(),
    // The invented regions belong to the guild of row 1, the server of the fake interactions.
    guilds: { idFor: (snowflake) => Promise.resolve(snowflake === FAKE_GUILD_ID ? 1 : undefined) },
    // What a router over this context counts in, unless a test gives it its own.
    throttles: new Throttles(),
    parties: noParties(),
    // Every member has the default settings.
    users: new MemoryUsers(),
    // Nobody wants or targets anything; a test passes its own stores to fill and read them.
    wants: new MemoryWants(),
    targetWants: new MemoryTargetWants(),
    // Over the context's own wants and target wants (below), unless a test passes its own.
    wantBoxes: undefined as unknown as WantBoxStorage,
    gymTargets: new MemoryGymTargets(),
    newTrains: new MemoryNewTrains(),
    // Nobody is named in the party history; a test passes its own to opt members in.
    historyOptIns: new MemoryHistoryOptIns(),
    regionTallies: unavailable<RegionTallies>(
      'regionTallies',
      'pass { regionTallies: tallies } from regionTalliesWith()',
    ),
    // Nobody is a member of any server; a test passes its own directory with members.
    members: new FakeMemberDirectory(),
    // No server offers any role; a test passes { selfRoles } from selfRolesWith().
    selfRoles: selfRolesWith().selfRoles,
    // What is put in line is only recorded; a test passes its own to read it.
    dms: new RecordingDms(),
    partyService: unavailable<PartyService>(
      'partyService',
      'pass { partyService, parties, regions } from partyServiceWith()',
    ),
    attendance: unavailable<AttendanceService>(
      'attendance',
      'pass { attendance, partyService, parties, regions } from partyServiceWith()',
    ),
    maxBattles: unavailable<MaxChangeService>(
      'maxBattles',
      'pass { maxBattles: made.maxes, … } from partyServiceWith() or reportedMax()',
    ),
    // No party store: an add moves no running battle (plan 8X-J) unless a test passes one.
    bossMoves: { move: () => Promise.resolve({ moved: 0, inTheWay: 0 }) },
    raids: unavailable<RaidChangeService>(
      'raids',
      'pass { raids, partyService, parties, regions } from partyServiceWith()',
    ),
    timedParties: unavailable<TimedPartyService>(
      'timedParties',
      'pass { timedParties: timed, partyService, parties, regions } from partyServiceWith()',
    ),
    trains: unavailable<TrainService>(
      'trains',
      'pass { trains, partyService, parties, regions } from partyServiceWith()',
    ),
    spawns: unavailable<SpawnService>(
      'spawns',
      'pass { spawns } from partyServiceWith(), or a SpawnService over a fake gateway',
    ),
    // Off, as the test settings have no moderators' channel; a test of meetup safety passes its
    // own from meetupSafetyWith().
    meetupSafety: undefined as unknown as MeetupSafety,
    // Over the context's own party service (below), unless a test passes its own.
    reports: undefined as unknown as ModerationReports,
    // Every click is answered by itself; a test of bursts passes its own with a window.
    clickAnswers: new ClickAnswers({ log, windowMs: 0 }),
    // Searches the catalogue of the context's own game data, built when first used.
    pokemon: pokemonFixture(gameData),
    nicknames: unavailable<PokemonNicknames>(
      'nicknames',
      'pass { pokemon: search, nicknames: search } from nicknameSearchWith()',
    ),
    maps: mapsFixture(),
    // Links that a test of /maps reads back with `redeem`.
    loginLinks: new LoginLinks(),
    // Every issue is recorded and opened; a test passes its own to read or fail them.
    issues: new FakeIssues(),
    // Every simulation is asked of a fake that answers the sample for Mewtwo; a test passes its own.
    pokebattler: new FakePokebattler(),
    // No place is found by name; a test passes its own with places.
    places: new FakePlaces(),
    // No screenshot can be read; a test passes a FakeScreenshotReader with its readings.
    screenshotReader: unavailableReader,
    screenshots: unavailable<Screenshots>(
      'screenshots',
      'pass { screenshots } from screenshotsWith() (test/support/screenshot-service.ts)',
    ),
    // No emoji: the game's icons are named in words; a test passes its own finder.
    emoji: { find: () => undefined },
    features: { ocrPassive: false, autoAssignRole: false },
    // Over the context's own gyms, Wayspots and regions (below), unless a test passes its own.
    placeFinder: undefined as unknown as PlaceFinder,
    // No stop of Pine's own, over memory and the context's own Wayspots (below), unless a test
    // passes its own.
    pineStops: undefined as unknown as PineStopService,
    // Over memory, with the context's own DMs (below), unless a test passes its own.
    scriptAccess: undefined as unknown as ScriptAccessService,
    ...overrides,
  };
  if (overrides.meetupSafety === undefined) {
    (ctx as { meetupSafety: MeetupSafety }).meetupSafety = new MeetupSafety({
      storage: new MemoryMeetupSafety(),
      gateway: unavailable<PartyGateway>(
        'gateway for meetup safety',
        'pass { meetupSafety: safety } from meetupSafetyWith()',
      ),
      parties: ctx.partyService,
      dms: ctx.dms,
      store: ctx.parties,
      guilds: ctx.guilds,
      settings: ctx.config.settings,
      log,
    });
  }
  if (overrides.reports === undefined) {
    // Off, as the test settings have no moderators' channel: a party's report goes into its
    // post. A test of reports to the moderators passes its own from reportsWith().
    (ctx as { reports: ModerationReports }).reports = new ModerationReports({
      storage: new MemoryReports(),
      gateway: unavailable<PartyGateway>(
        'gateway for reports',
        'pass { reports } from reportsWith()',
      ),
      parties: ctx.partyService,
      safety: ctx.meetupSafety,
      store: ctx.parties,
      regions: ctx.regions,
      gyms: ctx.gyms,
      settings: ctx.config.settings,
      log,
    });
  }
  if (overrides.scriptAccess === undefined) {
    // Nobody has asked for the Wayfarer export tool; the owner is the environment's. A test of
    // the owner's buttons passes its own over a MemoryScriptAccess it reads.
    (ctx as { scriptAccess: ScriptAccessService }).scriptAccess = new ScriptAccessService({
      store: new MemoryScriptAccess(),
      ownerId: ctx.config.env.OWNER_ID,
      dms: ctx.dms,
      log,
    });
  }
  if (overrides.wantBoxes === undefined) {
    (ctx as { wantBoxes: WantBoxStorage }).wantBoxes = new MemoryWantBoxes(
      ctx.wants,
      ctx.targetWants,
    );
  }
  if (overrides.stopReports === undefined) {
    (ctx as { stopReports: StopReportService }).stopReports = new StopReportService({
      store: new MemoryStopReports(),
      events: ctx.raidEvents,
      zone: ctx.config.settings.timezone,
      log,
      rewardHash: (reward) => rewardHash(reward, ctx.gameData.catalogue),
    });
  }
  if (overrides.rocket === undefined) {
    // Over the context's reports, posting no grunt's message (as in rehearsal mode) unless a
    // test passes its own over a `GruntMessageService` (`rocket.test.ts`).
    (ctx as { rocket: RocketService }).rocket = new RocketService({
      reports: ctx.stopReports,
      messages: undefined,
      regions: ctx.regions,
      guilds: ctx.guilds,
      log,
    });
  }
  if (overrides.pineStops === undefined) {
    const { wayspots } = ctx;
    (ctx as { pineStops: PineStopService }).pineStops = new PineStopService({
      storage: new MemoryPineStops(),
      // A directory takes the stops; a provider of a test's own that is none hears of none.
      wayspots:
        wayspots instanceof WayspotDirectory
          ? wayspots
          : { near: (...args) => wayspots.near(...args), setPineStops: () => undefined },
      guilds: ctx.guilds,
      log,
    });
  }
  if (overrides.placeFinder === undefined) {
    (ctx as { placeFinder: PlaceFinder }).placeFinder = new PlaceFinder({
      gyms: ctx.gyms,
      wayspots: ctx.wayspots,
      regions: ctx.regions,
      log,
    });
  }
  return { ctx, entries };
}
