import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ServerSettingsAuditStore,
  SettingsAuditRow,
} from '../../src/db/repositories/server-settings-audit-repository.js';
import { OTHER_SETTINGS_SERVER, SETTINGS_NOW, SETTINGS_SERVER } from './server-settings-cases.js';

export const SETTINGS_ASH = { id: '200000000000000011', name: 'Ash' };
const MISTY = { id: '200000000000000012' };

/** An entry of the log of a server's settings: at `at`, by Ash, the moderators' channel set. */
export function settingsAuditRow(
  at: number,
  overrides: Partial<SettingsAuditRow> = {},
): SettingsAuditRow {
  return {
    serverId: SETTINGS_SERVER,
    at,
    actor: SETTINGS_ASH,
    key: 'channels.moderation',
    before: null,
    after: '300000000000000009',
    ...overrides,
  };
}

/**
 * What every `ServerSettingsAuditStore` does (`ServerSettingsAuditRepository`,
 * `MemoryServerSettingsAudit`): `fresh` gives one that keeps nothing yet.
 */
export function serverSettingsAuditCases(fresh: () => Promise<ServerSettingsAuditStore>): void {
  describe('ServerSettingsAuditStore', () => {
    let store: ServerSettingsAuditStore;
    beforeEach(async () => {
      store = await fresh();
    });

    const withoutIds = (rows: readonly (SettingsAuditRow & { id: string })[]) =>
      rows.map(({ id: _id, ...row }) => row);

    it('keeps every fact of an entry as written: who, when, the key, its values as stored', async () => {
      const rows = [
        settingsAuditRow(SETTINGS_NOW),
        settingsAuditRow(SETTINGS_NOW + 1, {
          actor: MISTY,
          key: 'flaggedWords',
          before: ['garden'],
          after: ['garden', 'condo'],
        }),
        settingsAuditRow(SETTINGS_NOW + 2, { key: 'features.roles', before: false, after: true }),
      ];
      await store.insert(rows);
      expect(withoutIds(await store.ofServer(SETTINGS_SERVER, 10))).toEqual(rows);
    });

    it("gives a server's newest entries, oldest first, and no other server's", async () => {
      await store.insert([
        settingsAuditRow(SETTINGS_NOW + 2, { key: 'distanceUnits' }),
        settingsAuditRow(SETTINGS_NOW, { key: 'postNewGyms' }),
        settingsAuditRow(SETTINGS_NOW + 1, { key: 'invite' }),
        settingsAuditRow(SETTINGS_NOW + 3, { serverId: OTHER_SETTINGS_SERVER }),
      ]);
      const read = await store.ofServer(SETTINGS_SERVER, 2);
      expect(read.map((row) => row.key)).toEqual(['invite', 'distanceUnits']);
    });

    it("gives a member's newest entries in a server, oldest first", async () => {
      await store.insert([
        settingsAuditRow(SETTINGS_NOW, { key: 'postNewGyms' }),
        settingsAuditRow(SETTINGS_NOW + 1, { actor: MISTY, key: 'invite' }),
        settingsAuditRow(SETTINGS_NOW + 2, { key: 'distanceUnits' }),
        settingsAuditRow(SETTINGS_NOW + 3, { serverId: OTHER_SETTINGS_SERVER }),
        settingsAuditRow(SETTINGS_NOW + 4, { key: 'regionMapLink' }),
      ]);
      const read = await store.ofMember(SETTINGS_SERVER, SETTINGS_ASH.id, 2);
      expect(read.map((row) => row.key)).toEqual(['distanceUnits', 'regionMapLink']);
      expect(await store.ofMember(SETTINGS_SERVER, '200000000000000099', 5)).toEqual([]);
    });

    it('keeps entries of one moment in the order they were written', async () => {
      await store.insert([
        settingsAuditRow(SETTINGS_NOW, { key: 'channels.unown' }),
        settingsAuditRow(SETTINGS_NOW, { key: 'channels.moderation' }),
      ]);
      const read = await store.ofServer(SETTINGS_SERVER, 5);
      expect(read.map((row) => row.key)).toEqual(['channels.unown', 'channels.moderation']);
    });

    it('deletes the entries written before a moment, and says how many', async () => {
      await store.insert([
        settingsAuditRow(SETTINGS_NOW - 1),
        settingsAuditRow(SETTINGS_NOW, { serverId: OTHER_SETTINGS_SERVER }),
        settingsAuditRow(SETTINGS_NOW + 1),
      ]);
      expect(await store.deleteBefore(SETTINGS_NOW)).toBe(1);
      expect((await store.ofServer(SETTINGS_SERVER, 5)).map((row) => row.at)).toEqual([
        SETTINGS_NOW + 1,
      ]);
      expect(await store.ofServer(OTHER_SETTINGS_SERVER, 5)).toHaveLength(1);
    });

    it('keeps an actor without a name as their id alone', async () => {
      await store.insert([settingsAuditRow(SETTINGS_NOW, { actor: MISTY })]);
      expect((await store.ofServer(SETTINGS_SERVER, 1))[0]?.actor).toEqual(MISTY);
    });
  });
}
