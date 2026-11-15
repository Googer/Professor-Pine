import type { Kysely } from 'kysely';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type { DB } from '../types.js';
import { GymNotificationRepository } from './gym-notification-repository.js';
import { GymRepository } from './gym-repository.js';
import { SavedRouteRepository } from './saved-route-repository.js';

/** What went with a gym that was removed. */
export interface RemovedGym {
  /**
   * The server's saved routes (of its regions) that had it as a stop (changed, or removed when
   * it was their only one): what its question before the deletion counted.
   */
  routes: number;
  /** The server's members who had it as a gym target, each once. */
  targets: number;
  /**
   * Whether the gym's row went (no server was left); false when only the server's link went and
   * the gym stays the other servers'.
   */
  deleted: boolean;
}

/** The server a gym is removed from: its `Guild` row and the ids of its regions. */
export interface RemovingServer {
  guildId: number;
  regionIds: readonly number[];
}

/**
 * Removing a gym from a server with what names it there (`GymAdminService.delete`); lets tests
 * keep it in memory. All of it or none: when it rejects, nothing has changed.
 */
export interface GymRemoval {
  remove(gymId: number, server: RemovingServer): Promise<RemovedGym>;
}

/**
 * The gym's link to the server, the server's saved routes (those of its regions) that have it as
 * a stop and the server's gym targets of it, in one transaction (plan 19B-2); when no other
 * server has the gym, its row (with its metadata) and every saved route and target that still
 * names it, of every server; the counts are the server's alone. Either all of it went, or
 * everything is as it was. The gym's links are locked first,
 * so that two servers removing one gym at once decide in turn which of them is the last. A gym
 * that has no row any more (the legacy bot shares the table) is no failure: what named it is
 * cleaned up all the same.
 */
export class GymRemovalRepository implements GymRemoval {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * A deadlock (two removals, or a save of a route, meeting on the links or a route's row) runs
   * all of it again (`retryOnDeadlock`): the rollback undid the first try, and the links are read
   * again under their lock.
   */
  remove(gymId: number, server: RemovingServer): Promise<RemovedGym> {
    return retryOnDeadlock(this.db, () =>
      inTransaction(this.db, async (trx) => {
        const links = await trx
          .selectFrom('GymServer')
          .select('guildId')
          .where('gymId', '=', gymId)
          .forUpdate()
          .execute();
        const last = links.every((link) => link.guildId === server.guildId);
        // The counts are the server's own, as its question said them; what other servers still
        // name of a gym whose row goes goes with it, uncounted.
        const saved = new SavedRouteRepository(trx);
        const routes = await saved.removeGym(gymId, server.regionIds);
        if (last) await saved.removeGym(gymId, 'every');
        const targets = new GymNotificationRepository(trx);
        const members = await targets.membersTargeting(gymId, server.guildId);
        await targets.removeGym(gymId, last ? 'every' : server.guildId);
        if (last) await new GymRepository(trx).delete(gymId);
        else {
          await trx
            .deleteFrom('GymServer')
            .where('gymId', '=', gymId)
            .where('guildId', '=', server.guildId)
            .execute();
        }
        return { routes: routes.changed + routes.removed, targets: members, deleted: last };
      }),
    );
  }
}
