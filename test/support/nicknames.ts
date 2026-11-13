import {
  PokemonSearchService,
  type NicknameStore,
} from '../../src/services/pokemon-search-service.js';
import { FAKE_GUILD_ID } from './fake-interactions.js';
import { catalogueFixture } from './game-data.js';
import { createTestLogger } from './test-logger.js';

/** Stored nicknames for a test: by server's snowflake, then by catalogue key. */
export type StoredNicknames = Record<string, Record<string, readonly string[]>>;

/**
 * The servers' nicknames kept in memory, as `PokemonNicknameRepository` keeps them in
 * `PokemonNickname` (plan 19B-4): `rows` by server and catalogue key, each nickname once, a list
 * in the order the keys sort. `failing` makes reads reject (writes still go through, as when only
 * the read after a write fails); `holdRead` keeps the next read waiting until the function it
 * gives back is called; `asked` lists the servers of every read, in order.
 */
export class MemoryNicknames implements NicknameStore {
  readonly rows = new Map<string, Map<string, string[]>>();
  readonly asked: string[][] = [];
  failing = false;
  reads = 0;
  private held: Promise<void> | undefined;

  constructor(initial: StoredNicknames = {}) {
    for (const [server, byKey] of Object.entries(initial)) {
      this.rows.set(
        server,
        new Map(Object.entries(byKey).map(([key, list]) => [key, [...list].sort()])),
      );
    }
  }

  /** The next read waits until the function given back is called. */
  holdRead(): () => void {
    let release: () => void = () => undefined;
    this.held = new Promise((resolve) => {
      release = resolve;
    });
    return release;
  }

  async nicknamesOf(serverIds: readonly string[]): Promise<Map<string, Map<string, string[]>>> {
    this.reads += 1;
    this.asked.push([...serverIds]);
    const held = this.held;
    this.held = undefined;
    if (held) await held;
    if (this.failing) throw new Error('database is down');
    const snapshot = new Map<string, Map<string, string[]>>();
    for (const server of new Set(serverIds)) {
      const byKey = this.rows.get(server);
      if (byKey === undefined) continue;
      const kept = new Map([...byKey].filter(([, list]) => list.length > 0));
      if (kept.size > 0) snapshot.set(server, new Map([...kept].map(([k, v]) => [k, [...v]])));
    }
    return snapshot;
  }

  addNickname(serverId: string, key: string, nickname: string): Promise<void> {
    const byKey = this.rows.get(serverId) ?? new Map<string, string[]>();
    const list = byKey.get(key) ?? [];
    if (!list.includes(nickname)) byKey.set(key, [...list, nickname].sort());
    this.rows.set(serverId, byKey);
    return Promise.resolve();
  }

  removeNickname(serverId: string, key: string, nickname: string): Promise<boolean> {
    const list = this.rows.get(serverId)?.get(key) ?? [];
    if (!list.includes(nickname)) return Promise.resolve(false);
    this.rows.get(serverId)?.set(
      key,
      list.filter((one) => one !== nickname),
    );
    return Promise.resolve(true);
  }
}

/**
 * A real `PokemonSearchService` over the catalogue fixture and `MemoryNicknames`: `stored` the
 * nicknames of the fake interactions' server (`FAKE_GUILD_ID`), `others` those of other servers,
 * all of them read already. Pass it as `pokemon` and `nicknames` to `createTestContext`.
 */
export async function nicknameSearchWith(
  stored: Record<string, readonly string[]> = {},
  others: StoredNicknames = {},
) {
  const rows = new MemoryNicknames({ ...others, [FAKE_GUILD_ID]: stored });
  const { log, entries } = createTestLogger();
  const search = new PokemonSearchService({ catalogue: catalogueFixture() }, rows, log);
  await search.load([FAKE_GUILD_ID, ...Object.keys(others)]);
  return { search, rows, logged: entries };
}
