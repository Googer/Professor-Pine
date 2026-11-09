import type { EventWindowStorage } from '../../src/db/repositories/event-window-repository.js';
import type { EventWindow } from '../../src/domain/time/event-window.js';

/**
 * The kept event window in memory (`EventWindowStorage`), the twin of `EventWindowRepository`;
 * `failing` per method.
 */
export class MemoryEventWindows implements EventWindowStorage {
  private kept: EventWindow | undefined;
  readonly failing = new Map<keyof EventWindowStorage, Error>();

  constructor(kept?: EventWindow) {
    this.kept = kept === undefined ? undefined : { ...kept };
  }

  current(): Promise<EventWindow | undefined> {
    const err = this.failing.get('current');
    if (err) return Promise.reject(err);
    return Promise.resolve(this.kept === undefined ? undefined : { ...this.kept });
  }

  keep(window: EventWindow): Promise<void> {
    const err = this.failing.get('keep');
    if (err) return Promise.reject(err);
    this.kept = { ...window };
    return Promise.resolve();
  }
}
