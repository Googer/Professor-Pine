import { KeyedLock } from './keyed-lock.js';

/**
 * The one lock of the administration of gyms and regions: what runs under it runs alone. Gym
 * administration decides under it what a server's staff may touch by the regions' rows, and
 * measures from gym to gym; region administration changes those rows under it. So the two
 * exclude each other, and neither needs to look out for the other.
 *
 * Lock order: this lock, then a gym's (`PartyStore.withGymLock`), then a party's. It is not
 * re-entrant: work that asks for it again from inside never finishes.
 */
export class AdminLock {
  private readonly lock = new KeyedLock<'admin'>();

  run<T>(work: () => T | Promise<T>): Promise<T> {
    return this.lock.run('admin', work);
  }

  /** How many calls wait behind the one running under the lock. For tests. */
  waiting(): number {
    return Math.max(0, this.lock.pending('admin') - 1);
  }

  /** Resolves once nothing runs or waits under the lock. For shutdown and for tests. */
  whenIdle(): Promise<void> {
    return this.lock.whenIdle();
  }
}
