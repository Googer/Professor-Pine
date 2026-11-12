import {
  fileDefaults,
  parseServerValues,
  type ServerValues,
} from '../../src/config/server-settings.js';
import { loadSettings } from '../../src/config/settings.js';
import {
  checkServerValues,
  type ServerSettingsService,
} from '../../src/services/server-settings.js';
import { ELITE_GYM_CHANNEL, REMOTE_CHANNEL } from './gyms.js';
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

/**
 * The servers' settings of a test (`ServerSettingsService` in memory): every server has `values`
 * (`testServerValues()` unless given) until a change of its own (`set`, recorded in `changes`);
 * `rows` are the servers with a row (all, unless `without` names some), `setUp` when each was set
 * up (null unless given).
 */
export class TestServers implements ServerSettingsService {
  readonly changed = new Map<string, ServerValues>();
  readonly changes: Array<{ serverId: string; by: string; values: ServerValues }> = [];
  readonly without = new Set<string>();
  readonly setUp = new Map<string, number>();
  failing: Error | undefined;

  constructor(public values: ServerValues = testServerValues()) {}

  of(serverId: string): ServerValues {
    return this.changed.get(serverId) ?? this.values;
  }

  has(serverId: string): boolean {
    return !this.without.has(serverId);
  }

  setUpAt(serverId: string): number | null {
    return this.setUp.get(serverId) ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- the real one writes first
  async set(
    serverId: string,
    change: (values: ServerValues) => ServerValues,
    by: string,
  ): Promise<ServerValues> {
    if (this.failing) throw this.failing;
    const values = checkServerValues(change(this.of(serverId)));
    this.changed.set(serverId, values);
    this.without.delete(serverId);
    this.changes.push({ serverId, by, values });
    return values;
  }
}
