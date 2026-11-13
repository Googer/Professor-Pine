import type { WantCountStorage } from '../../src/db/repositories/want-count-repository.js';

/**
 * The daily want counts in memory (`WantCountStorage`), for tests of `WantCountService`: what the
 * wants count as now is what a test puts in `standing` (by server, by key: the repository counts
 * it from the tables of wants, `want-count-repository.db.test.ts`), and the servers with a row are
 * those it holds; `asked` records the servers of each `countNow`, in order. `days` holds what was
 * written, by `<server> <day>`, a key written again keeping its count as the repository's upsert
 * does. `failing` makes `countNow` reject; `failingWrites` the writes of the servers it holds,
 * each with its error, writing nothing of them.
 */
export class MemoryWantCounts implements WantCountStorage {
  standing = new Map<string, Map<string, number>>();
  readonly days = new Map<string, Map<string, number>>();
  readonly asked: (readonly string[])[] = [];
  failing: Error | undefined;
  readonly failingWrites = new Map<string, Error>();

  servers(): Promise<string[]> {
    return Promise.resolve([...this.standing.keys()]);
  }

  countNow(serverIds: readonly string[]): Promise<Map<string, Map<string, number>>> {
    this.asked.push(serverIds);
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) {
          reject(this.failing);
          return;
        }
        try {
          resolve(
            new Map(
              [...this.standing]
                .filter(([server]) => serverIds.includes(server))
                .map(([server, keys]) => [server, new Map(keys)]),
            ),
          );
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  serversCounted(day: string): Promise<Set<string>> {
    return Promise.resolve(
      new Set(
        [...this.days.keys()]
          .filter((at) => at.endsWith(` ${day}`))
          .map((at) => at.slice(0, -day.length - 1)),
      ),
    );
  }

  write(serverId: string, day: string, counts: ReadonlyMap<string, number>): Promise<void> {
    const failing = this.failingWrites.get(serverId);
    if (failing) return Promise.reject(failing);
    const at = `${serverId} ${day}`;
    const kept = this.days.get(at) ?? new Map<string, number>();
    for (const [key, count] of counts) if (!kept.has(key)) kept.set(key, count);
    this.days.set(at, kept);
    return Promise.resolve();
  }

  countsOf(serverId: string, day: string): Promise<Map<string, number>> {
    return Promise.resolve(new Map(this.days.get(`${serverId} ${day}`)));
  }
}
