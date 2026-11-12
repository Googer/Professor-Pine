import { describe, expect, it } from 'vitest';
import {
  filledRow,
  SETTINGS_ACTOR,
  SETTINGS_NOW,
  SETTINGS_SERVER,
} from './server-settings-cases.js';
import { serverSettingsCases } from './server-settings-cases.js';
import { MemoryServerSettings } from './server-settings.js';

describe('MemoryServerSettings', () => {
  serverSettingsCases(() => {
    const store = new MemoryServerSettings();
    return Promise.resolve({ store, log: store.audit });
  });

  it('writes nothing when its log cannot be written, as the transaction of the repository', async () => {
    const store = new MemoryServerSettings([filledRow()]);
    store.audit.failing.set('insert', new Error('the log is away'));
    await expect(
      store.write(SETTINGS_SERVER, { postNewGyms: true }, SETTINGS_NOW + 1, SETTINGS_ACTOR, [
        { key: 'postNewGyms', before: false, after: true },
      ]),
    ).rejects.toThrow('the log is away');
    expect(store.rows.get(SETTINGS_SERVER)).toEqual(filledRow());
  });
});
