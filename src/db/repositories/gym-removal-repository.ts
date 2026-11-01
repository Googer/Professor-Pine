import type { Kysely } from 'kysely';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';
import { GymNotificationRepository } from './gym-notification-repository.js';
import { GymRepository } from './gym-repository.js';
import { SavedRouteRepository } from './saved-route-repository.js';

/** What went with a gym that was removed. */
export interface RemovedGym {
  /** The saved routes that had it as a stop (changed, or removed when it was their only one). */
  routes: number;
  /** The members who had it as a gym target, each once, over all servers. */
  targets: number;
}

/**
 * Removing a gym with what names it in the database (`GymAdminService.delete`); lets tests keep
 * it in memory. All of it or none: when it rejects, nothing has changed.
 */
export interface GymRemoval {
  remove(gymId: number): Promise<RemovedGym>;
}

/**
 * The gym's row (with its metadata), the saved routes that have it as a stop and every gym
 * target of it, in one transaction: either the gym is gone with what named it, or everything
 * is as it was. A gym that has no row any more (the legacy bot shares the table) is no failure:
 * what named it is cleaned up all the same.
 */
export class GymRemovalRepository implements GymRemoval {
  constructor(private readonly db: Kysely<DB>) {}

  remove(gymId: number): Promise<RemovedGym> {
    return inTransaction(this.db, async (trx) => {
      const routes = await new SavedRouteRepository(trx).removeGym(gymId);
      const targets = new GymNotificationRepository(trx);
      const members = await targets.membersTargeting(gymId);
      await targets.removeGym(gymId);
      await new GymRepository(trx).delete(gymId);
      return { routes: routes.changed + routes.removed, targets: members };
    });
  }
}
