import type { PineStopStorage } from '../../src/db/repositories/pine-stop-repository.js';
import type { NewPineStop, PineStop, PineStopChange } from '../../src/domain/stops/pine-stop.js';

/** Methods a test can make fail (`failing`). */
type Method = keyof PineStopStorage;

/**
 * The stops of Pine's own in memory (`PineStopStorage`), for tests: the twin of
 * `PineStopRepository`, running `pineStopCases` as it does. `rows` by id; `failing` makes a
 * method reject with the error given.
 */
export class MemoryPineStops implements PineStopStorage {
  readonly rows = new Map<number, PineStop>();
  readonly failing = new Map<Method, Error>();
  private nextId = 1;

  constructor(stops: readonly PineStop[] = []) {
    for (const stop of stops) {
      this.rows.set(stop.id, { ...stop });
      this.nextId = Math.max(this.nextId, stop.id + 1);
    }
  }

  private fail(method: Method): void {
    const err = this.failing.get(method);
    if (err) throw err;
  }

  all(): Promise<PineStop[]> {
    this.fail('all');
    return Promise.resolve(
      [...this.rows.values()].sort((a, b) => a.id - b.id).map((s) => ({ ...s })),
    );
  }

  add(stop: NewPineStop): Promise<PineStop> {
    this.fail('add');
    const made: PineStop = {
      ...stop,
      id: this.nextId++,
      updatedBy: stop.createdBy,
      updatedAt: stop.createdAt,
    };
    this.rows.set(made.id, made);
    return Promise.resolve({ ...made });
  }

  update(
    id: number,
    serverId: string,
    change: PineStopChange,
    by: string,
    at: number,
  ): Promise<PineStop | undefined> {
    this.fail('update');
    const row = this.rows.get(id);
    if (row?.serverId !== serverId) return Promise.resolve(undefined);
    const changed = { ...row, ...change, updatedBy: by, updatedAt: at };
    this.rows.set(id, changed);
    return Promise.resolve({ ...changed });
  }

  remove(id: number, serverId: string): Promise<PineStop | undefined> {
    this.fail('remove');
    const row = this.rows.get(id);
    if (row?.serverId !== serverId) return Promise.resolve(undefined);
    this.rows.delete(id);
    return Promise.resolve(row);
  }
}
