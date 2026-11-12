import {
  fileDefaults,
  parseServerValues,
  settingChanges,
  type ServerValues,
} from '../../src/config/server-settings.js';
import { loadSettings } from '../../src/config/settings.js';
import type { SettingsActor } from '../../src/db/repositories/server-settings-audit-repository.js';
import {
  checkServerValues,
  type ServerSettingsService,
} from '../../src/services/server-settings.js';
import { ELITE_GYM_CHANNEL, REMOTE_CHANNEL } from './gyms.js';
import { MemoryServerSettingsAudit } from './server-settings-audit.js';
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
    return this.setUp.get(serverId) ?? null;
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
    this.changed.set(serverId, values);
    this.without.delete(serverId);
    this.changes.push({ serverId, by, values });
    return values;
  }
}
