import type { Kysely } from 'kysely';
import { migrationPlan } from '../db/migrator.js';
import { CutoverRepository } from '../db/repositories/cutover-repository.js';
import { RoleAuthorizationRepository } from '../db/repositories/role-authorization-repository.js';
import type { DB } from '../db/types.js';
import type { CutoverStore } from './cutover-check.js';
import { ServerSettingsRepository } from '../db/repositories/server-settings-repository.js';

/**
 * What the cutover check reads of the database (`cutover-check-cli.ts`, in a read-only
 * transaction), from a database of any shape: a legacy one, a Pine one, an empty one, one whose
 * table names Windows lower-cased. A table it lacks gives nothing, never an error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a legacy database as a Pine one
export function databaseStore(db: Kysely<any>): CutoverStore {
  const cutover = new CutoverRepository(db);
  return {
    migrationPlan: () => migrationPlan(db),
    guilds: () => cutover.servers(),
    regionRows: () => cutover.regions(),
    selfRoles: () => cutover.selfRoles(),
    // The servers' settings of 2.1 (plan 19A-1): none before its first start.
    serverSettings: async () =>
      (await cutover.hasTables('ServerSettings'))
        ? new ServerSettingsRepository(db as Kysely<DB>).all()
        : [],
    // The legacy tables are there before the takeover and after it, until the final cleanup
    // drops them; a database without them has no restrictions to carry over.
    legacyRestrictions: async () =>
      (await cutover.hasTables('CommandRoleAuthorization', 'CommandRoles', 'Guild'))
        ? new RoleAuthorizationRepository(db as Kysely<DB>).list()
        : [],
  };
}
