import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ServerSettingsStorage,
  StoredServer,
} from '../../src/db/repositories/server-settings-repository.js';

export const SETTINGS_SERVER = '412345678901234567';
export const OTHER_SETTINGS_SERVER = '412345678901234568';
export const SETTINGS_STAFF = '200000000000000001';
export const SETTINGS_NOW = Date.parse('2026-11-12T15:00:00Z');

/** A server's first row as the fill writes it: set up at the upgrade, changed by nobody. */
export function filledRow(overrides: Partial<StoredServer> = {}): StoredServer {
  return {
    serverId: SETTINGS_SERVER,
    settings: { channels: { 'bot-lab': '300000000000000001' }, distanceUnits: 'metric' },
    setUpAt: SETTINGS_NOW,
    updatedAt: SETTINGS_NOW,
    updatedBy: null,
    ...overrides,
  };
}

/**
 * What every `ServerSettingsStorage` does (`ServerSettingsRepository`, `MemoryServerSettings`):
 * `fresh` gives one that keeps nothing yet.
 */
export function serverSettingsCases(fresh: () => Promise<ServerSettingsStorage>): void {
  describe('ServerSettingsStorage', () => {
    let store: ServerSettingsStorage;
    beforeEach(async () => {
      store = await fresh();
    });

    it('keeps no server until one is written', async () => {
      expect(await store.all()).toEqual([]);
      expect(await store.one(SETTINGS_SERVER)).toBeUndefined();
    });

    it("writes a server's first row once: a second is not written over it", async () => {
      expect(await store.create(filledRow())).toBe(true);
      const second = filledRow({ settings: { distanceUnits: 'imperial' }, setUpAt: null });
      expect(await store.create(second)).toBe(false);
      expect(await store.all()).toEqual([filledRow()]);
    });

    it('writes values in the place of those kept, with who and when, keeping when it was set up', async () => {
      await store.create(filledRow());
      await store.create(filledRow({ serverId: OTHER_SETTINGS_SERVER, setUpAt: null }));
      const changed = { distanceUnits: 'imperial', flaggedWords: ['garden'] };
      await store.write(SETTINGS_SERVER, changed, SETTINGS_NOW + 60_000, SETTINGS_STAFF);
      expect(await store.one(SETTINGS_SERVER)).toEqual(
        filledRow({
          settings: changed,
          updatedAt: SETTINGS_NOW + 60_000,
          updatedBy: SETTINGS_STAFF,
        }),
      );
      expect(await store.one(OTHER_SETTINGS_SERVER)).toEqual(
        filledRow({ serverId: OTHER_SETTINGS_SERVER, setUpAt: null }),
      );
    });

    it('gives a server without a row one when its values are written, not set up', async () => {
      await store.write(SETTINGS_SERVER, { postNewGyms: true }, SETTINGS_NOW, SETTINGS_STAFF);
      expect(await store.all()).toEqual([
        {
          serverId: SETTINGS_SERVER,
          settings: { postNewGyms: true },
          setUpAt: null,
          updatedAt: SETTINGS_NOW,
          updatedBy: SETTINGS_STAFF,
        },
      ]);
    });
  });
}
