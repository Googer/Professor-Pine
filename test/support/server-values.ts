import {
  fileDefaults,
  parseServerValues,
  settingChanges,
  type ServerValues,
} from '../../src/config/server-settings.js';
import { instanceZone, loadSettings } from '../../src/config/settings.js';
import type { SettingsActor } from '../../src/db/repositories/server-settings-audit-repository.js';
import { sameZone } from '../../src/domain/time/zoned.js';
import type { Logger } from '../../src/log.js';
import {
  checkServerValues,
  type ServerSettingsService,
  type ZoneListener,
  type ZonesListener,
} from '../../src/services/server-settings.js';
import { ELITE_GYM_CHANNEL, REMOTE_CHANNEL } from './gyms.js';
import { MemoryServerSettingsAudit } from './server-settings-audit.js';
import { createTestLogger } from './test-logger.js';
import { TEST_SETTINGS_PATH } from './test-settings.js';

/**
 * The ids of the channels of the test settings' names (`test/fixtures/settings.json`), as the
 * fill would have resolved them in the fakes' server (plan 19A-1): the copies' channels are the
 * fake gateway's (`gatewayWithMirrorChannels`), the bot updates `gymAdminWith`'s.
 */
export const TEST_SERVER_CHANNELS = {
  'bot-lab': '300000000000000001',
  'mod-bot-lab': '300000000000000002',
  unown: '300000000000000003',
  'elite-gym-raids': ELITE_GYM_CHANNEL,
  'remote-raids': REMOTE_CHANNEL,
  pvp: '300000000000000006',
  'bot-updates': '100000000000000031',
} as const;
/** The PvP category (`categories.pvp`, "PVP CHAT AND TOURNAMENTS") and the Unown role (`unown`). */
export const TEST_PVP_CATEGORY = '300000000000000011';
export const TEST_UNOWN_ROLE = '300000000000000021';
/** The map's member role of `withMapRole`, which the web server of the tests names `Verified`. */
export const TEST_MAP_ROLE = '300000000000000031';

/** The servers of a test whose features differ from the test settings' (`features` of their values). */
export function withFeatures(features: Partial<ServerValues['features']>): TestServers {
  const values = testServerValues();
  return new TestServers({ ...values, features: { ...values.features, ...features } });
}

/** Changes the values every server of a test's context has (`TestServers.values`). */
export function changeServers(ctx: { servers: unknown }, change: Partial<ServerValues>): void {
  if (!(ctx.servers instanceof TestServers)) throw new Error('the context has no TestServers');
  ctx.servers.values = { ...ctx.servers.values, ...change };
}

/** The servers of a test, those named each with its own invite (`invite` of its values). */
export function withInvites(
  invites: Readonly<Record<string, string>>,
  servers: TestServers = new TestServers(),
): TestServers {
  for (const [serverId, invite] of Object.entries(invites)) {
    servers.changed.set(serverId, { ...servers.of(serverId), invite });
  }
  return servers;
}

/** The servers of a test whose map only members with `TEST_MAP_ROLE` count on. */
export function withMapRole(): TestServers {
  return new TestServers(
    testServerValues({ roles: { unown: TEST_UNOWN_ROLE, mapMember: TEST_MAP_ROLE } }),
  );
}

/**
 * A server's values as the upgrade makes them of the test settings: the file's server keys, its
 * names as the ids above; `overrides` on top (checked as a stored row is).
 */
export function testServerValues(overrides: Partial<ServerValues> = {}): ServerValues {
  return parseServerValues({
    ...fileDefaults(loadSettings(TEST_SETTINGS_PATH)),
    channels: { ...TEST_SERVER_CHANNELS },
    categories: { pvp: TEST_PVP_CATEGORY },
    roles: { unown: TEST_UNOWN_ROLE },
    ...overrides,
  });
}

/** When the servers of a test that are not in setup were set up (`TestServers.setUpAt`). */
export const SET_UP_LONG_AGO = Date.parse('2026-01-01T00:00:00Z');

/** The file's defaults of the test settings, read once (`TestServers.defaults`). */
let testDefaults: ServerValues | undefined;

/**
 * The servers' settings of a test (`ServerSettingsService` in memory): every server has `values`
 * (`testServerValues()` unless given) until a change of its own (`set`, recorded in `changes`,
 * each setting it changed in the staff's log `audit` at `now()`, as the real one; a change of
 * nothing records nothing); `rows` are the servers with a row (all, unless `without` names some),
 * `setUp` when each was set up (null unless given).
 */
export class TestServers implements ServerSettingsService {
  readonly changed = new Map<string, ServerValues>();
  readonly changes: Array<{ serverId: string; by: SettingsActor; values: ServerValues }> = [];
  readonly without = new Set<string>();
  readonly setUp = new Map<string, number>();
  /**
   * The servers in setup (plan 19C-2): their rows have no `setUpAt`. Every other server with a row
   * was set up long ago (`SET_UP_LONG_AGO`) unless `setUp` gives its time.
   */
  readonly settingUp = new Set<string>();
  readonly audit = new MemoryServerSettingsAudit();
  failing: Error | undefined;
  /** The clock of the log's entries. */
  now: () => number = () => Date.now();

  /**
   * `values`: what every server has; `fileValues`: the file's defaults (`defaults()`, a DM's), those
   * of the test settings unless given.
   */
  constructor(
    public values: ServerValues = testServerValues(),
    private readonly fileValues?: ServerValues,
  ) {}

  of(serverId: string): ServerValues {
    return this.changed.get(serverId) ?? this.values;
  }

  zoneOf(serverId: string): string {
    return this.of(serverId).timezone ?? this.defaultZone();
  }

  /** The test settings' zone (`America/New_York`), unless the file's defaults given say another. */
  defaultZone(): string {
    return this.defaults().timezone ?? instanceZone(loadSettings(TEST_SETTINGS_PATH));
  }

  /**
   * The servers the bot is in, as the real one's `present` (fix round 1, K5); unset: the default,
   * `values`' zone and every server changed.
   */
  present: readonly string[] | undefined;

  /** Each name once by its exact string, as the real one's (fix round 2, P1). */
  zonesInUse(): readonly string[] {
    const zones = new Set([this.defaultZone()]);
    if (this.present === undefined) {
      zones.add(this.values.timezone ?? this.defaultZone());
      for (const serverId of this.changed.keys()) zones.add(this.zoneOf(serverId));
    } else {
      for (const serverId of this.present) zones.add(this.zoneOf(serverId));
    }
    return [...zones];
  }

  /** The listeners of a change of zone, which `set` tells as the real one does. */
  readonly zoneListeners: ZoneListener[] = [];
  /** The listeners of a change of the zones in use, which `presenceChanged` tells. */
  readonly zonesListeners: ZonesListener[] = [];
  /** Where a listener that throws is logged, as the real one's log. */
  log: Logger = createTestLogger().log;

  onZoneChange(listener: ZoneListener): void {
    this.zoneListeners.push(listener);
  }

  onZonesInUseChange(listener: ZonesListener): void {
    this.zonesListeners.push(listener);
  }

  /**
   * The servers present are now `present` (a server joined or left): a change of the zones in use
   * is told, as the real one's `presenceChanged`.
   */
  presenceChanged(present: readonly string[]): void {
    const before = this.zonesInUse();
    this.present = present;
    this.tellZonesInUse(before);
  }

  /** Tells the listeners of the zones in use if they are not `before`, as the real one does. */
  private tellZonesInUse(before: readonly string[]): void {
    const zones = this.zonesInUse();
    // By exact string, as the real one's (fix round 2, P1).
    const names = new Set(before);
    if (before.length === zones.length && zones.every((zone) => names.has(zone))) return;
    for (const listener of this.zonesListeners) {
      try {
        listener(zones);
      } catch (err) {
        this.log.error({ err }, 'a listener of a change of the zones in use failed');
      }
    }
  }

  /** The file's defaults of the test settings, as the real one's: no channel, category or role. */
  defaults(): ServerValues {
    if (this.fileValues !== undefined) return this.fileValues;
    testDefaults ??= fileDefaults(loadSettings(TEST_SETTINGS_PATH));
    return testDefaults;
  }

  has(serverId: string): boolean {
    return !this.without.has(serverId);
  }

  setUpAt(serverId: string): number | null {
    if (!this.has(serverId) || this.settingUp.has(serverId)) return null;
    return this.setUp.get(serverId) ?? SET_UP_LONG_AGO;
  }

  /** As the real one: a server with a row that has no `setUpAt` (plan 19C-2). */
  inSetup(serverId: string): boolean {
    return this.has(serverId) && this.setUpAt(serverId) === null;
  }

  serversInSetup(): string[] {
    return [...this.settingUp].filter((serverId) => this.has(serverId)).sort();
  }

  /** The servers set up by `markSetUp`, in order. */
  readonly markedSetUp: string[] = [];
  /** While set, `markSetUp` rejects with it. */
  markFailing: Error | undefined;

  /**
   * As the real one: once, only for a server in setup whose values `done` says are done; then set
   * up at `now()`.
   */
  markSetUp(serverId: string, done: (values: ServerValues) => boolean): Promise<boolean> {
    if (this.markFailing) return Promise.reject(this.markFailing);
    if (!this.inSetup(serverId) || !done(this.of(serverId))) return Promise.resolve(false);
    this.settingUp.delete(serverId);
    this.setUp.set(serverId, this.now());
    this.markedSetUp.push(serverId);
    return Promise.resolve(true);
  }

  async set(
    serverId: string,
    change: (values: ServerValues) => ServerValues,
    by: SettingsActor,
  ): Promise<ServerValues> {
    if (this.failing) throw this.failing;
    const before = this.of(serverId);
    const values = checkServerValues(change(before));
    // As the real one: nothing changed, nothing written; else the staff's log of each setting.
    const changed = settingChanges(before, values);
    if (changed.length === 0) return before;
    await this.audit.insert(
      changed.map((one) => ({ serverId, at: this.now(), actor: by, ...one })),
    );
    const was = this.zoneOf(serverId);
    const inUse = this.zonesInUse();
    this.changed.set(serverId, values);
    this.without.delete(serverId);
    this.changes.push({ serverId, by, values });
    const zone = this.zoneOf(serverId);
    if (sameZone(zone, was)) {
      // As the real one (fix round 3, Q4): another name of its zone may be a name new in use.
      if (before.timezone !== values.timezone) this.tellZonesInUse(inUse);
      return values;
    }
    for (const listener of this.zoneListeners) {
      // As the real one (fix round 1, K7): a listener that throws is logged, the change stands.
      try {
        listener(serverId, zone, was);
      } catch (err) {
        this.log.error({ err, server: serverId }, 'a listener of a change of time zone failed');
      }
    }
    return values;
  }
}

/**
 * The servers of a test each in a zone of its own (plan 19A-2): `zones` by server, every other
 * server in the test settings' zone (`America/New_York`), as `servers.zoneOf` gives them.
 */
export function withZones(
  zones: Readonly<Record<string, string>>,
  servers: TestServers = new TestServers(),
): TestServers {
  for (const [serverId, timezone] of Object.entries(zones)) {
    servers.changed.set(serverId, { ...servers.of(serverId), timezone });
  }
  return servers;
}
