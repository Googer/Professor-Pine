import {
  PokemonSearchService,
  type NicknameStore,
} from '../../src/services/pokemon-search-service.js';
import {
  keyForLegacyName,
  legacyNameForKey,
  legacyNamesForKey,
} from '../../src/domain/pogo/legacy-names.js';
import { tidyNickname } from '../../src/domain/pogo/nickname-rules.js';
import { catalogueFixture } from './game-data.js';
import { createTestLogger } from './test-logger.js';

/**
 * The moderators' nicknames kept in memory, as `PokemonRepository` keeps them in the legacy
 * `Pokemon` table: `rows` by the row's name (in the order of their ids), several names of one
 * Pokémon read together under its key (`keyForLegacyName`), in lower case, an addition going to
 * the first row of the Pokémon, a removal taken from every row, nicknames compared tidied, and a
 * RangeError when a row's joined string would pass the 255 characters of the column. `failing`
 * makes reads reject; `holdRead` keeps the next read waiting until the function it gives back is
 * called.
 */
export class MemoryNicknames implements NicknameStore {
  readonly rows = new Map<string, string[]>();
  failing = false;
  reads = 0;
  private held: Promise<void> | undefined;

  constructor(initial: Record<string, string[]> = {}) {
    for (const [name, nicknames] of Object.entries(initial)) this.rows.set(name, [...nicknames]);
  }

  /** The next read waits until the function given back is called. */
  holdRead(): () => void {
    let release: () => void = () => undefined;
    this.held = new Promise((resolve) => {
      release = resolve;
    });
    return release;
  }

  async nicknames(): Promise<Map<string, string[]>> {
    this.reads += 1;
    const snapshot = new Map<string, string[]>();
    for (const [name, list] of this.rows) {
      const tidied = list.map(tidyNickname);
      if (tidied.length === 0) continue;
      const key = keyForLegacyName(name);
      snapshot.set(key, [...new Set([...(snapshot.get(key) ?? []), ...tidied])]);
    }
    const held = this.held;
    this.held = undefined;
    if (held) await held;
    if (this.failing) throw new Error('database is down');
    return snapshot;
  }

  /** The names of the rows that hold this Pokémon, in the order of their ids. */
  private namesOf(key: string): string[] {
    const names = legacyNamesForKey(key);
    return [...this.rows.keys()].filter((name) => names.includes(name.toLowerCase()));
  }

  addNickname(key: string, nickname: string): Promise<string[]> {
    const added = tidyNickname(nickname);
    const names = this.namesOf(key);
    const all = [
      ...new Set(names.flatMap((name) => (this.rows.get(name) ?? []).map(tidyNickname))),
    ];
    if (all.includes(added)) return Promise.resolve(all);
    const [first = legacyNameForKey(key)] = names;
    const list = this.rows.get(first) ?? [];
    if ([...list, added].join(', ').length > 255) {
      return Promise.reject(new RangeError('The nicknames would not fit in the stored string'));
    }
    this.rows.set(first, [...list, added]);
    return Promise.resolve([...all, added]);
  }

  removeNickname(key: string, nickname: string): Promise<boolean> {
    const removed = tidyNickname(nickname);
    let found = false;
    for (const name of this.namesOf(key)) {
      const list = this.rows.get(name) ?? [];
      const kept = list.filter((one) => tidyNickname(one) !== removed);
      if (kept.length === list.length) continue;
      found = true;
      this.rows.set(name, kept);
    }
    return Promise.resolve(found);
  }
}

/**
 * A real `PokemonSearchService` over the catalogue fixture and `MemoryNicknames` with these
 * stored nicknames, already read. Pass it as `pokemon` and `nicknames` to `createTestContext`.
 */
export async function nicknameSearchWith(stored: Record<string, string[]> = {}) {
  const rows = new MemoryNicknames(stored);
  const { log, entries } = createTestLogger();
  const search = new PokemonSearchService({ catalogue: catalogueFixture() }, rows, log);
  await search.reloadNicknames();
  return { search, rows, logged: entries };
}
