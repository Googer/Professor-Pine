import { describe, expect, it } from 'vitest';
import { loadSettings } from '../config/settings.js';
import { TestServers } from '../../test/support/server-values.js';
import { MemoryServerSettings } from '../../test/support/server-settings.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { ServerSettings } from '../services/server-settings.js';
import { serverValuesOf } from './server-values.js';

describe('the values where an interaction came from', () => {
  it("are the file's defaults in a DM, without a channel, category or role, in the tests as in the bot (review F13)", async () => {
    const real = new ServerSettings({
      store: new MemoryServerSettings(),
      settings: loadSettings(TEST_SETTINGS_PATH),
      log: createTestLogger().log,
    });
    await real.load();
    const dm = { guildId: null };
    const inTests = serverValuesOf(dm, { servers: new TestServers() });
    expect(inTests).toEqual(serverValuesOf(dm, { servers: real }));
    expect(inTests.channels).toEqual({});
    expect(inTests.categories).toEqual({});
    expect(inTests.roles).toEqual({});
  });
});
