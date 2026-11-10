import type {
  KeptMaxEvents,
  MaxEventStorage,
} from '../../src/db/repositories/max-event-repository.js';
import type { BigEvent, MaxEvent } from '../../src/domain/time/max-events.js';

/**
 * The kept max and big events in memory (`MaxEventStorage`), the twin of `MaxEventRepository`;
 * `failing` per method.
 */
export class MemoryMaxEvents implements MaxEventStorage {
  private kept: KeptMaxEvents = { max: [], big: [] };
  readonly failing = new Map<keyof MaxEventStorage, Error>();

  constructor(kept: Partial<KeptMaxEvents> = {}) {
    this.kept = copy({ max: kept.max ?? [], big: kept.big ?? [] });
  }

  /** The error a method is told to fail with: it rejects, as the repository does. */
  private failure(method: keyof MaxEventStorage): Error | undefined {
    return this.failing.get(method);
  }

  all(): Promise<KeptMaxEvents> {
    const err = this.failure('all');
    return err ? Promise.reject(err) : Promise.resolve(copy(this.kept));
  }

  replace(events: KeptMaxEvents): Promise<void> {
    const err = this.failure('replace');
    if (err) return Promise.reject(err);
    this.kept = copy(events);
    return Promise.resolve();
  }
}

/** Each kind in order of its start (then name), as the repository gives them; copies. */
function copy(events: KeptMaxEvents): KeptMaxEvents {
  const order = (a: MaxEvent | BigEvent, b: MaxEvent | BigEvent): number =>
    a.start - b.start || a.name.localeCompare(b.name);
  return {
    max: events.max
      .map((event) => ({
        ...event,
        featured:
          event.featured === undefined
            ? undefined
            : { ...event.featured, names: [...event.featured.names] },
      }))
      .sort(order),
    big: events.big.map((event) => ({ ...event })).sort(order),
  };
}
