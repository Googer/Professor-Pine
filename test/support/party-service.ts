import { MemoryTargetWants } from './target-wants.js';
import { gymStop, stopHandle, stopKey, type StopRef } from '../../src/domain/party/stops.js';
import { loadSettings } from '../../src/config/settings.js';
import type {
  AccessGrant,
  AccessGrantStorage,
} from '../../src/db/repositories/access-grant-repository.js';
import type { HistoryStorage } from '../../src/db/repositories/history-repository.js';
import { PartyRepository, type PartyStorage } from '../../src/db/repositories/party-repository.js';
import type {
  Region,
  RegionOutline,
  RemovedRegion,
  SavedOutline,
} from '../../src/db/repositories/region-repository.js';
import { isClosedRing } from '@pine/wayspot-core/lat-lon';
import type { UserSettings } from '../../src/db/repositories/user-repository.js';
import { AccessService } from '../../src/services/access-service.js';
import { BossTierMoves } from '../../src/services/boss-tier-moves.js';
import { PartyLines } from '../../src/services/party-lines.js';
import { auditNamesOf, PartyAudit } from '../../src/services/party-audit.js';
import { PartyScheduler } from '../../src/services/party-scheduler.js';
import { AttendanceService, type Member } from '../../src/services/attendance-service.js';
import {
  isRaid,
  type MaxParty,
  type MeetupParty,
  type Party,
  type RaidParty,
  type TrainAtEnd,
  type TrainParty,
} from '../../src/domain/party/party.js';
import { FORUM_TAGS } from '../../src/render/party-post.js';
import { lobbySize } from '../../src/domain/party/lobby.js';
import { PartyStatus } from '../../src/domain/party/status.js';
import {
  PartyService,
  type MaxReport,
  type MeetupRequest,
  type PartyServiceOptions,
  type RaidReport,
  type TrainRequest,
} from '../../src/services/party-service.js';
import { NotifyService, type NotifyServiceOptions } from '../../src/services/notify-service.js';
import { MemoryPartyAudit } from './party-audit.js';
import { SpawnService } from '../../src/services/spawn-service.js';
import { MemorySpawnReports } from './spawn-reports.js';
import { RecordingDms } from './dms.js';
import { FakePartyGateway } from './fake-gateway.js';
import { MemoryGymTargets } from './gym-targets.js';
import { MemoryHistory } from './history.js';
import { FakeMemberDirectory } from './members.js';
import { MemoryNewTrains } from './new-trains.js';
import { MemoryWants } from './wants.js';
import { catalogueFixture } from './game-data.js';
import {
  EAST_FORUM,
  ELITE_GYM_CHANNEL,
  REMOTE_CHANNEL,
  testRegions,
  WEST_CHANNEL,
  WEST_FORUM,
} from './gyms.js';
import { at, MemoryPartyStorage, PARTY_NOW, REPORTER, TEST_SPOT } from './parties.js';
import { gymsFixture } from './providers.js';
import { raidBossesFixture } from './raid-bosses.js';
import { raidEventsFixture } from './raid-events.js';
import { MemorySavedRoutes } from './saved-routes.js';
import { createTestLogger } from './test-logger.js';
import { NO_MAX_BOSSES } from './test-context.js';
import { MemoryUsers } from './users.js';
import { TEST_SETTINGS_PATH } from './test-settings.js';
import { TestServers } from './server-values.js';
import { PartyHistory } from '../../src/services/party-history.js';
import { stopRegionsInGuild } from '../../src/services/region-directory.js';
import { PartyStore } from '../../src/services/party-store.js';
import { MaxChangeService } from '../../src/services/max-change-service.js';
import { RaidChangeService } from '../../src/services/raid-change-service.js';
import { TimedPartyService } from '../../src/services/timed-party-service.js';
import { TrainService, type TrainManage } from '../../src/services/train-service.js';
import { placeOf } from '../../src/domain/party/train.js';
import { NO_FIRST } from '../../src/render/train-dialogs.js';
import type { EventSpawnProvider } from '../../src/services/event-page-service.js';

/** The invented regions as a directory whose rows a test can change; `load` does nothing. */
export class TestRegions {
  rows: Region[] = testRegions();
  readonly summaries: { id: number; forumChannelId: string; messageId: string | null }[] = [];
  byId = (id: number) => this.rows.find((region) => region.id === id);
  byChannel = (channelId: string) => this.rows.find((region) => region.channelId === channelId);
  byForum = (forumId: string) => this.rows.find((region) => region.forumChannelId === forumId);
  all = () => this.rows;
  load = () => Promise.resolve();
  /** What `RegionRepository.setForum` does, on the rows above. */
  setForum = (
    id: number,
    forumChannelId: string | null,
  ): Promise<'set' | 'no-region' | 'forum-taken'> => {
    const region = this.rows.find((row) => row.id === id);
    if (!region) return Promise.resolve('no-region');
    if (
      forumChannelId !== null &&
      this.rows.some((row) => row.id !== id && row.forumChannelId === forumChannelId)
    ) {
      return Promise.resolve('forum-taken');
    }
    if (region.forumChannelId !== forumChannelId) region.summaryMessageId = null;
    region.forumChannelId = forumChannelId;
    return Promise.resolve('set');
  };
  /** What `RegionRepository.setSummaryMessage` does, on the rows above. */
  setSummaryMessage = (id: number, forumChannelId: string, messageId: string | null) => {
    this.summaries.push({ id, forumChannelId, messageId });
    const region = this.rows.find((row) => row.id === id && row.forumChannelId === forumChannelId);
    if (!region) return Promise.resolve(false);
    region.summaryMessageId = messageId;
    return Promise.resolve(true);
  };
  /** Makes `saveOutlines` and `remove` reject, with nothing changed. */
  failing: Error | undefined;
  /**
   * What goes with a region's row by the foreign keys of the database, when a test has them:
   * the saved routes of the region, and the region of its parties' rows.
   */
  cascade: { routes?: MemorySavedRoutes; parties?: MemoryPartyStorage } = {};

  private answer<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          if (this.failing) throw this.failing;
          resolve(work());
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  /**
   * What `RegionRepository.saveOutlines` does (region-repository.db.test.ts pins it down), on
   * the rows above: all or none, a new row for a channel that has none, and a channel of
   * another server fails the call.
   */
  saveOutlines = (guildId: number, outlines: readonly RegionOutline[]): Promise<SavedOutline[]> =>
    this.answer(() => {
      for (const { channelId, ring } of outlines) {
        if (!isClosedRing(ring)) throw new Error('A region outline must be a closed ring');
        const existing = this.rows.find((row) => row.channelId === channelId);
        if (existing && existing.guildId !== guildId) {
          throw new Error(`Region ${existing.id} of channel ${channelId} is another server's`);
        }
      }
      return outlines.map(({ channelId, ring }) => {
        const existing = this.rows.find((row) => row.channelId === channelId);
        if (existing) {
          // A new object: what holds the old row keeps the old outline, as with the database.
          this.rows[this.rows.indexOf(existing)] = { ...existing, bounds: [...ring] };
          return { channelId, regionId: existing.id, created: false };
        }
        const id = Math.max(0, this.lastId, ...this.rows.map((row) => row.id)) + 1;
        this.lastId = id;
        this.rows.push({
          id,
          guildId,
          channelId,
          description: null,
          bounds: [...ring],
          forumChannelId: null,
          summaryMessageId: null,
        });
        return { channelId, regionId: id, created: true };
      });
    });
  /** The highest id ever given: the id of a removed region is not given again. */
  private lastId = 0;

  /** What `RegionRepository.remove` does, on the rows above, with what `cascade` names. */
  remove = (id: number, guildId: number): Promise<RemovedRegion> =>
    this.answer(() => {
      const index = this.rows.findIndex((row) => row.id === id && row.guildId === guildId);
      const row = this.rows[index];
      if (!row) return { removed: false as const };
      this.lastId = Math.max(this.lastId, ...this.rows.map((one) => one.id));
      this.rows.splice(index, 1);
      this.cascade.parties?.dropRegion(id);
      return {
        removed: true as const,
        routes: this.cascade.routes?.dropRegion(id) ?? 0,
        forumChannelId: row.forumChannelId,
        summaryMessageId: row.summaryMessageId,
      };
    });
}

/**
 * The grants of access to forums, kept in memory as `AccessGrantRepository` keeps them. Set
 * `failing` to make every call reject.
 */
export class MemoryAccessGrants implements AccessGrantStorage {
  failing: Error | undefined;
  readonly rows: AccessGrant[] = [];

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  list(): Promise<AccessGrant[]> {
    return this.attempt(() => [...this.rows]);
  }

  add(grant: AccessGrant): Promise<void> {
    return this.attempt(() => {
      const recorded = this.rows.some(
        (row) => row.forumChannelId === grant.forumChannelId && row.memberId === grant.memberId,
      );
      if (!recorded) this.rows.push(grant);
    });
  }

  remove(forumChannelId: string, memberId: string): Promise<void> {
    return this.attempt(() => {
      const index = this.rows.findIndex(
        (row) => row.forumChannelId === forumChannelId && row.memberId === memberId,
      );
      if (index >= 0) this.rows.splice(index, 1);
    });
  }
}

/**
 * A fake gateway whose server has the two channels for copies of raids, as the test servers'
 * values name them by id (`REMOTE_CHANNEL`, `ELITE_GYM_CHANNEL`), under the test settings' names.
 * Without them, as in most tests, a raid has no copies. Pass it as `{ gateway }` in `kept`.
 */
export function gatewayWithMirrorChannels(): FakePartyGateway {
  const { channels } = loadSettings(TEST_SETTINGS_PATH);
  const gateway = new FakePartyGateway();
  gateway.channelNames.set(REMOTE_CHANNEL, channels['remote-raids']);
  gateway.channelNames.set(ELITE_GYM_CHANNEL, channels['elite-gym-raids']);
  return gateway;
}

/** What a restart of the bot leaves as it was: the database, Discord, and the time. */
export interface Outliving {
  storage: MemoryPartyStorage;
  /** The recorded grants of access to forums. */
  grants: AccessGrantStorage;
  gateway: FakePartyGateway;
  regions: TestRegions;
  clock: { now: number };
  tags: Record<typeof WEST_FORUM | typeof EAST_FORUM, Readonly<Record<string, string>>>;
  userSettings: Map<string, Partial<UserSettings>>;
  /** The routes members saved. */
  routes: MemorySavedRoutes;
  /** What members want to be told about, the gyms they target, who hears of new trains. */
  wants: MemoryWants;
  /** The wants of TargetWant (plan 8R-1): research rewards, the Dynamax and Gigantamax boxes. */
  targetWants: MemoryTargetWants;
  gymTargets: MemoryGymTargets;
  newTrains: MemoryNewTrains;
  /** The party history: the steps of active parties, the records of ended ones, the opt-ins. */
  history: MemoryHistory;
  /** The storage the store really uses, when that is not the one in memory (a database test). */
  database: PartyStorage | undefined;
  /** With `database`: the history the retries of what failed go to (`HistoryRepository`). */
  historyStorage: HistoryStorage | undefined;
  /** The staff audit log. */
  auditStore?: MemoryPartyAudit;
}

/**
 * What a test may set differently: the options of the party service, and under `notifying`
 * those of the notifier alone (a provider of its own that fails, a clock of its own).
 */
export type ServiceOverrides = Partial<PartyServiceOptions> & {
  /** Each server's values (plan 19A-1); `new TestServers()` unless given. */
  servers?: TestServers;
  notifying?: Partial<NotifyServiceOptions>;
  /** How long a spawn report stands (the service of `/wild`); default thirty minutes. */
  spawnDeleteAfterMs?: number;
  /** The spawns of the events on, for costumed spawn reports (plan 8R-4); default none. */
  spawnCostumes?: Pick<EventSpawnProvider, 'sightingsAt'>;
  /** How many parties the history's sweep records between two lines of progress. */
  historySweepProgressEvery?: number;
};

/**
 * The services as they are after a restart: new ones, which remember nothing, over the same
 * storage, gateway, regions and clock.
 */
export function restarted(made: Outliving, overrides: ServiceOverrides = {}) {
  return partyServiceWith([], overrides, made);
}

/**
 * A party service over fakes: the invented gyms and regions (West and East have forums, which
 * exist on the fake gateway with every tag), the fixture bosses and events, a store over memory
 * and a clock a test can move (`clock.now`). Posts are brought up to date only by `flush()`.
 *
 * `attendance` is the attendance service over the same store and gateway; its lines go out only
 * by its own `flush()`. `raids` and `timed` are the services for what members change about a
 * raid and about a meetup, `bossMoves` moves running battles with their boss (plan 8X-J); their
 * lines go out with those of `attendance`, and `timed.flush()`
 * waits for the message that announces a start time. `trains` is the service for what members
 * change about a train; `trains.flush()` waits for the message that says where a train is
 * going. `userSettings` holds what differs from the defaults, by member.
 * `scheduler` is the clock over all of it: it never runs by itself, a test calls `tick()`.
 * `access` lets members into forums they cannot see (on the fake gateway everybody sees every
 * forum unless `gateway.shutOut` says otherwise); it works on the side, `access.flush()` waits.
 *
 * `notify` is the notifier over the same store, told by the services as in the bot: who wants
 * something is in `wants`, `gymTargets` and `newTrains` (nobody, until a test says so), everybody is a
 * member of the server and sees what the fake gateway lets them see (`members`), and what would
 * be sent is only recorded (`dms`). It works on the side: `notify.flush()` waits.
 * `notifyOptions` are its options: `new NotifyService(notifyOptions)` is the notifier of a
 * restarted process over the same stores and `dms`, which remembers nothing it told. `spawns` is
 * the service of `/wild` over the same gateway; its deletion timers never run by themselves
 * (`spawnTimers`), and what stands of it is kept in memory (`spawnReports`), as the bot keeps it in its table.
 *
 * `kept` is what outlives a restart (see `restarted`).
 */
export async function partyServiceWith(
  parties: readonly Party[] = [],
  overrides: ServiceOverrides = {},
  kept?: Partial<Outliving>,
) {
  const { notifying, spawnDeleteAfterMs, spawnCostumes, historySweepProgressEvery, ...forService } =
    overrides;
  const clock = kept?.clock ?? { now: PARTY_NOW };
  const now = () => clock.now;
  const storage = kept?.storage ?? new MemoryPartyStorage(parties);
  const { log, entries } = createTestLogger();
  const database = kept?.database;
  const history = kept?.history ?? new MemoryHistory();
  history.parties = storage.rows;
  // Its tries of what failed never run by themselves: `recorder.flush()` runs them. Over the
  // database, they go to the database's history as the notes do.
  const recorder = new PartyHistory({
    storage: kept?.historyStorage ?? history,
    gameData: overrides.gameData ?? { catalogue: catalogueFixture() },
    raidBosses: overrides.raidBosses ?? raidBossesFixture(),
    maxBosses: overrides.maxBosses ?? NO_MAX_BOSSES,
    log,
    setTimer: () => () => undefined,
    // The rows of the storage it uses (over a database, its own repository's).
    readParty: async (partyId) => {
      if (database instanceof PartyRepository) {
        const stored = await database.findById(partyId);
        return stored === undefined ? undefined : stored.ok ? stored.party : 'unreadable';
      }
      if (storage.unreadable.has(partyId)) return 'unreadable';
      return storage.rows.get(partyId);
    },
    ...(historySweepProgressEvery === undefined
      ? {}
      : { sweepProgressEvery: historySweepProgressEvery }),
    // As the bot finds them (plan 8H-7A): the gyms, kept Wayspots and regions of the services.
    stopRegions: (guildId, stop) =>
      stopRegionsInGuild(
        { gyms, ...(forService.wayspots === undefined ? {} : { wayspots: forService.wayspots }) },
        regions,
        stop,
        guildId,
      ).map((region) => region.id),
  });
  storage.history = history;
  storage.historyFailed = (note, err) => {
    recorder.failed(note, err);
  };
  const store = new PartyStore({ storage: database ?? storage, log, now, history: recorder });
  await store.load();
  const gateway = kept?.gateway ?? new FakePartyGateway();
  // The staff audit log over memory, listening to the store as in the bot: `audit.flush()` waits.
  const auditStore = kept?.auditStore ?? new MemoryPartyAudit();
  const grants = kept?.grants ?? new MemoryAccessGrants();
  const access = new AccessService({
    store,
    gateway,
    guilds: {
      idFor: (snowflake) => Promise.resolve(snowflake === gateway.guildId ? 1 : undefined),
    },
    storage: grants,
    log,
    now,
  });
  await access.load();
  const tags = kept?.tags ?? {
    [WEST_FORUM]: gateway.addForum(WEST_FORUM, FORUM_TAGS, 'west-raids'),
    [EAST_FORUM]: gateway.addForum(EAST_FORUM, FORUM_TAGS, 'east-raids'),
  };
  const regions = kept?.regions ?? new TestRegions();
  const settings = loadSettings(TEST_SETTINGS_PATH);
  // Every server's values (plan 19A-1): the test settings', unless a test passes its own.
  const servers = forService.servers ?? new TestServers();
  const userSettings = kept?.userSettings ?? new Map<string, Partial<UserSettings>>();
  const users = new MemoryUsers(userSettings);
  // One list of gyms for all the services, as in the bot; a test of gym administration passes
  // its own (a directory that changes).
  const gyms = forService.gyms ?? gymsFixture();
  const service = new PartyService({
    store,
    gateway,
    regions,
    regionStore: regions,
    gyms,
    raidBosses: raidBossesFixture(),
    maxBosses: NO_MAX_BOSSES,
    gameData: { catalogue: catalogueFixture() },
    raidEvents: raidEventsFixture(),
    users,
    settings,
    servers,
    log,
    // The fakes' server is the guild of row 1, which the invented regions belong to.
    guilds: {
      idFor: (snowflake) => Promise.resolve(snowflake === gateway.guildId ? 1 : undefined),
      snowflakeOf: (id) => Promise.resolve(id === 1 ? gateway.guildId : undefined),
    },
    now,
    // Long enough that nothing runs by itself during a test.
    renderDelayMs: 3_600_000,
    sharedDelayMs: 3_600_000,
    // The raids along an ended train's way (plan 8H-7A), from the records in memory.
    raidsAlong: history,
    // What ended parties left, kept by the storage the store writes to.
    ...(database === undefined
      ? { leftovers: storage }
      : database instanceof PartyRepository
        ? { leftovers: database }
        : {}),
    ...forService,
  });
  const wants = kept?.wants ?? new MemoryWants();
  const targetWants = kept?.targetWants ?? new MemoryTargetWants();
  const gymTargets = kept?.gymTargets ?? new MemoryGymTargets();
  const newTrains = kept?.newTrains ?? new MemoryNewTrains();
  const members = new FakeMemberDirectory();
  members.everybody = true;
  members.sees = (channelId, userId) =>
    gateway.canSee(channelId, userId) && !gateway.leftServer.has(userId);
  const dms = new RecordingDms();
  const notifyOptions: NotifyServiceOptions = {
    store,
    posts: service,
    wants,
    targetWants,
    gymTargets,
    newTrains,
    users,
    members,
    dms,
    servers,
    serverOfRow: (row) => (row === 1 ? gateway.guildId : undefined),
    guilds: {
      snowflakeOf: (id) => Promise.resolve(id === 1 ? gateway.guildId : undefined),
      idFor: (snowflake) => Promise.resolve(snowflake === gateway.guildId ? 1 : undefined),
    },
    regions,
    gyms,
    gameData: overrides.gameData ?? { catalogue: catalogueFixture() },
    raidBosses: overrides.raidBosses ?? raidBossesFixture(),
    settings: overrides.settings ?? settings,
    log,
    now,
    // Long enough that nothing is told by itself during a test: `notify.flush()` does it.
    meetingDelayMs: 3_600_000,
    ...notifying,
  };
  const notify = new NotifyService(notifyOptions);
  service.announceTo(notify);
  /** The spawn reports that stand, as the bot keeps them in `SpawnReport`. */
  const spawnReports = new MemorySpawnReports();
  /** The timers of the spawn reports that wait for their deletion: a test fires them by hand. */
  const spawnTimers: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const spawns = new SpawnService({
    gateway,
    raidBosses: overrides.raidBosses ?? raidBossesFixture(),
    gameData: overrides.gameData ?? { catalogue: catalogueFixture() },
    notify,
    store: spawnReports,
    settings: overrides.settings ?? settings,
    servers,
    ...(spawnDeleteAfterMs === undefined ? {} : { deleteAfterMs: spawnDeleteAfterMs }),
    ...(spawnCostumes === undefined ? {} : { costumes: spawnCostumes }),
    log,
    now,
    setTimer: (run, ms) => {
      const timer = { run, ms, cancelled: false };
      spawnTimers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  const lines = new PartyLines({
    gateway,
    whileOpen: (postId, work) => service.whileOpenPost(postId, work),
    log,
    delayMs: 3_600_000,
  });
  const attendance = new AttendanceService({
    store,
    gateway,
    posts: service,
    lines,
    users,
    notify,
    settings,
    log,
    now,
    // A size given to the party service (a test of lobbies) is the attendance service's too.
    ...(forService.lobbySize === undefined ? {} : { lobbySize: forService.lobbySize }),
  });
  const raids = new RaidChangeService({
    store,
    posts: service,
    lines,
    questions: attendance,
    gyms,
    regions,
    gameData: { catalogue: catalogueFixture() },
    notify,
    settings,
    log,
    now,
  });
  const maxes = new MaxChangeService({
    store,
    posts: service,
    lines,
    notify,
    // A size given to the party service (a test of lobbies) is the max changes' too.
    lobbySize: forService.lobbySize ?? ((party) => lobbySize(party, settings.lobbies)),
    log,
    now,
  });
  const bossMoves = new BossTierMoves({ store, posts: service, raids, lines, log, now });
  const timed = new TimedPartyService({
    store,
    gateway,
    posts: service,
    lines,
    users,
    notify,
    log,
    zone: settings.timezone,
    now,
    // Long enough that nothing is announced by itself during a test: `timed.flush()` does it.
    announceDelayMs: 3_600_000,
  });
  const routes = kept?.routes ?? new MemorySavedRoutes();
  const trains = new TrainService({
    store,
    gateway,
    posts: service,
    lines,
    timedLines: timed,
    users,
    gyms,
    ...(forService.wayspots === undefined ? {} : { wayspots: forService.wayspots }),
    regions,
    routes,
    splits: service,
    log,
    now,
    // As for a start time: `trains.flush()` sends what is waiting.
    announceDelayMs: 3_600_000,
  });
  const audit = new PartyAudit({
    store,
    storage: auditStore,
    guilds: { snowflakeOf: (id) => Promise.resolve(id === 1 ? gateway.guildId : undefined) },
    names: auditNamesOf({
      gyms,
      ...(forService.wayspots === undefined ? {} : { wayspots: forService.wayspots }),
      regions,
      gameData: overrides.gameData ?? { catalogue: catalogueFixture() },
    }),
    log,
    now,
  });
  const raidBosses = overrides.raidBosses ?? raidBossesFixture();
  const scheduler = new PartyScheduler({
    store,
    history: recorder,
    posts: service,
    attendance,
    routes: trains,
    access,
    audit,
    splits: service,
    lines,
    gateway,
    raidBosses,
    users,
    notify,
    settings,
    log,
    now,
  });
  return {
    service,
    attendance,
    access,
    audit,
    auditStore,
    grants,
    raids,
    maxes,
    bossMoves,
    timed,
    trains,
    routes,
    scheduler,
    notify,
    notifyOptions,
    spawns,
    spawnTimers,
    spawnReports,
    wants,
    targetWants,
    gymTargets,
    newTrains,
    members,
    dms,
    lines,
    users,
    userSettings,
    gyms,
    store,
    storage,
    history,
    recorder,
    database,
    historyStorage: kept?.historyStorage,
    gateway,
    regions,
    tags,
    entries,
    log,
    settings,
    servers,
    clock,
  };
}

/**
 * A raid reported through the service, with its post on the fake gateway: at the Library (gym 1,
 * region West), by `REPORTER`, who is interested. An egg without times unless `report` says
 * otherwise (`boss: { key: 'yveltal' }` makes it a raid that was seen hatched).
 */
export async function reportedRaid(
  report: Partial<RaidReport> = {},
  overrides: ServiceOverrides = {},
  kept?: Partial<Outliving>,
) {
  const made = await partyServiceWith([], overrides, kept);
  const gym = gymsFixture().get(1);
  if (!gym) throw new Error('the invented gyms have no gym 1');
  const outcome = await made.service.reportRaid({
    gym,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: { level: 'T5', shadow: false },
    boss: null,
    ...report,
  });
  if (outcome.kind !== 'created') throw new Error(`the raid was not created: ${outcome.kind}`);
  await made.service.flush();
  const postId = outcome.party.forumPostId;
  if (postId === null) throw new Error('the raid has no post');
  /** The raid as it is stored now. */
  const current = (): RaidParty => {
    const party = made.store.get(outcome.party.id);
    if (!party || !isRaid(party)) throw new Error('the raid is no longer active');
    return party;
  };
  /** The texts of the messages in the post that were not deleted, oldest first. */
  const said = (): string[] =>
    made.gateway.messagesIn(postId).map((message) => message.message.content ?? '');
  return { ...made, party: outcome.party, postId, current, said };
}

/**
 * A max battle reported through the service (plan 8X-3), with its post on the fake gateway: a
 * Dynamax Machamp (2★) at `TEST_SPOT` (region West), by `REPORTER`, who is interested, in the
 * channel of West, ending at 21:00 of the test day.
 */
export async function reportedMax(
  report: Partial<MaxReport> = {},
  overrides: ServiceOverrides = {},
  kept?: Partial<Outliving>,
) {
  const made = await partyServiceWith([], overrides, kept);
  const outcome = await made.service.reportMax({
    spot: TEST_SPOT,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: 'D2',
    boss: { key: 'machamp' },
    endTime: at('2026-10-13T21:00'),
    regionChannelId: WEST_CHANNEL,
    ...report,
  });
  if (outcome.kind !== 'created') throw new Error(`the max battle was not made: ${outcome.kind}`);
  await made.service.flush();
  const postId = outcome.party.forumPostId;
  if (postId === null) throw new Error('the max battle has no post');
  /** The max battle as it is stored now. */
  const current = (): MaxParty => {
    const party = made.store.get(outcome.party.id);
    if (party?.type !== 'max') throw new Error('the max battle is no longer active');
    return party;
  };
  /** The texts of the messages in the post that were not deleted, oldest first. */
  const said = (): string[] =>
    made.gateway.messagesIn(postId).map((message) => message.message.content ?? '');
  return { ...made, party: outcome.party, postId, current, said };
}

/**
 * A meetup made through the service, with its post on the fake gateway: "Community Day picnic",
 * made in the channel of West by `REPORTER`, who is interested. It has no times.
 */
export async function createdMeetup(
  request: Partial<MeetupRequest> = {},
  overrides: ServiceOverrides = {},
  kept?: Partial<Outliving>,
) {
  const made = await partyServiceWith([], overrides, kept);
  const outcome = await made.service.createMeetup({
    name: 'Community Day picnic',
    creatorId: REPORTER,
    regionChannelId: WEST_CHANNEL,
    ...request,
  });
  if (outcome.kind !== 'created') throw new Error(`the meetup was not created: ${outcome.kind}`);
  await made.service.flush();
  const postId = outcome.party.forumPostId;
  if (postId === null) throw new Error('the meetup has no post');
  /** The meetup as it is stored now. */
  const current = (): MeetupParty => {
    const party = made.store.get(outcome.party.id);
    if (party?.type !== 'meetup') throw new Error('the meetup is no longer active');
    return party;
  };
  /** The texts of the messages in the post that were not deleted, oldest first. */
  const said = (): string[] =>
    made.gateway.messagesIn(postId).map((message) => message.message.content ?? '');
  return { ...made, party: outcome.party, postId, current, said };
}

/**
 * A raid train made through the service, with its post on the fake gateway: "Saturday
 * legendaries", made in the channel of West by `REPORTER`, who is interested. It has no route,
 * no conductor and no times. `route` puts it on these gyms, at the first of them.
 */
export async function createdTrain(
  request: Partial<TrainRequest> & { route?: readonly (number | StopRef)[] } = {},
  overrides: ServiceOverrides = {},
  kept?: Partial<Outliving>,
) {
  const made = await partyServiceWith([], overrides, kept);
  const { route = [], ...asked } = request;
  const outcome = await made.service.createTrain({
    name: 'Saturday legendaries',
    creatorId: REPORTER,
    regionChannelId: WEST_CHANNEL,
    ...asked,
  });
  if (outcome.kind !== 'created') throw new Error(`the train was not created: ${outcome.kind}`);
  for (const stop of route) {
    const ref = typeof stop === 'number' ? gymStop(stop) : stop;
    const added = await made.trains.addStop(outcome.party.id, { id: REPORTER }, ref);
    if (added.kind !== 'ok') throw new Error(`stop ${stopKey(ref)} was not added: ${added.kind}`);
  }
  await made.attendance.flush();
  await made.service.flush();
  const postId = outcome.party.forumPostId;
  if (postId === null) throw new Error('the train has no post');
  // What was said while the route was laid is not what a test looks at.
  for (const message of made.gateway.messagesIn(postId)) {
    await made.gateway.deleteMessage(postId, message.id);
  }
  /** The train as it is stored now. */
  const current = (): TrainParty => {
    const party = made.store.get(outcome.party.id);
    if (party?.type !== 'train') throw new Error('the train is no longer active');
    return party;
  };
  /** The texts of the messages in the post that were not deleted, oldest first. */
  const said = (): string[] =>
    made.gateway.messagesIn(postId).map((message) => message.message.content ?? '');
  /**
   * Manage… as it sets the mode or reverses the route (`TrainService.manage`, the only way since
   * plan 8M-8C, review C5): drawn where the train is now and from the stop its route begins with
   * now, unless `from` and `first` say where a dialog was drawn.
   */
  const managed = (
    member: Member,
    staff: boolean,
    asked: TrainManage,
    from?: string,
    first?: string,
  ) => {
    const party = current();
    const start = party.train.route[0];
    return made.trains.manage(party.id, member, staff, asked, {
      from: from ?? placeOf(party),
      first: first ?? (start === undefined ? NO_FIRST : stopHandle(start)),
    });
  };
  /** The mode at the end of the route set through Manage…. */
  const setAtEnd = (member: Member, staff: boolean, atEnd: TrainAtEnd) =>
    managed(member, staff, { atEnd });
  /** The route reversed through Manage…. */
  const reverse = (member: Member, staff: boolean, from?: string, first?: string) =>
    managed(member, staff, { route: 'reverse' }, from, first);
  return { ...made, party: outcome.party, postId, current, said, setAtEnd, reverse };
}
