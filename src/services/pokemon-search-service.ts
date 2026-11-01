import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import type { PokemonEntry } from '../domain/pogo/game-master.js';
import {
  nicknameProblem,
  tidyNickname,
  type NicknameProblem,
} from '../domain/pogo/nickname-rules.js';
import { CURATED_NICKNAMES } from '../domain/pogo/nicknames.js';
import {
  PokemonSearch,
  mergeNicknames,
  type PokemonHit,
  type PokemonSearchOptions,
} from '../domain/pogo/pokemon-search.js';
import type { Logger } from '../log.js';
import type { GameDataProvider } from './game-data-service.js';

/** The part of `PokemonRepository` the search reads. */
export interface NicknameSource {
  nicknames(): Promise<Map<string, string[]>>;
}

/** The part of `PokemonRepository` that staff change nicknames through (`/admin nickname`). */
export interface NicknameStore extends NicknameSource {
  /** Throws RangeError when the stored string would be longer than its column. */
  addNickname(key: string, nickname: string): Promise<string[]>;
  removeNickname(key: string, nickname: string): Promise<boolean>;
}

/** What handlers need: Pokémon by what members type. */
export interface PokemonFinder {
  /**
   * Best fit first; see `PokemonSearch`. Results include near misses: never act on the first one
   * without `exact`.
   */
  search(text: string, options?: PokemonSearchOptions): PokemonEntry[];
  /**
   * What `search` finds, each hit with how it fits (`PokemonMatch`): for a list that orders or
   * leaves out by that (a guess is offered only where its label shows why it is there).
   */
  find(text: string, options?: PokemonSearchOptions): PokemonHit[];
  /**
   * The one entry this text names outright (its name, key, an id that stands for it, or a
   * nickname no other entry has); undefined when the text is anything less. Act on this; offer
   * `search` results as a choice.
   */
  exact(text: string): PokemonEntry | undefined;
}

/**
 * What came of adding a nickname:
 * - `added`: stored; `nicknames` are the Pokémon's stored nicknames afterwards;
 * - `refused`: the text is no nickname (`NicknameProblem`);
 * - `taken`: it is already the name, an id or a nickname of these other Pokémon;
 * - `already`: it already finds this Pokémon (its name, an id, or a nickname it has);
 * - `full`: the Pokémon's nicknames would not fit the legacy column with it.
 */
export type NicknameAdded =
  | { kind: 'added'; nickname: string; nicknames: string[] }
  | { kind: 'refused'; problem: NicknameProblem }
  | { kind: 'taken'; nickname: string; by: PokemonEntry[] }
  | { kind: 'already'; nickname: string }
  | { kind: 'full'; nickname: string };

/** The nicknames staff add for searching (`/admin nickname`). */
export interface PokemonNicknames {
  /** The moderators' nicknames as last read, by catalogue key, in lower case. */
  stored(): ReadonlyMap<string, readonly string[]>;
  /** The nicknames that come with the bot (`CURATED_NICKNAMES`) of an entry. */
  curated(key: string): readonly string[];
  add(entry: PokemonEntry, text: string): Promise<NicknameAdded>;
  /** Whether the Pokémon had that stored nickname (curated ones cannot be removed). */
  remove(entry: PokemonEntry, text: string): Promise<boolean>;
}

/**
 * The Pokémon search over the game data in use and the nicknames (the curated list and the
 * moderators' from the database). The index is rebuilt by itself when the game data was
 * refreshed; call `reloadNicknames` after a nickname was added or removed elsewhere.
 *
 * Reads of the nicknames and the changes staff make run one at a time, in the order they were
 * asked for: of two overlapping reads the later one is always applied last, and a nickname is
 * looked at for clashes and written without another change in between.
 */
export class PokemonSearchService implements PokemonFinder, PokemonNicknames {
  private storedNicknames = new Map<string, string[]>();
  private built: { catalogue: PokemonCatalogue; search: PokemonSearch } | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly gameData: GameDataProvider,
    private readonly source: NicknameStore,
    private readonly log?: Logger,
  ) {}

  /** Reads the moderators' nicknames. Until this has run, only the curated ones are known. */
  reloadNicknames(): Promise<void> {
    return this.inTurn(() => this.read());
  }

  search(text: string, options?: PokemonSearchOptions): PokemonEntry[] {
    return this.current().search(text, options);
  }

  find(text: string, options?: PokemonSearchOptions): PokemonHit[] {
    return this.current().find(text, options);
  }

  exact(text: string): PokemonEntry | undefined {
    return this.current().exact(text);
  }

  stored(): ReadonlyMap<string, readonly string[]> {
    return mergeNicknames(this.gameData.catalogue, this.storedNicknames);
  }

  curated(key: string): readonly string[] {
    return Object.hasOwn(CURATED_NICKNAMES, key) ? (CURATED_NICKNAMES[key] ?? []) : [];
  }

  add(entry: PokemonEntry, text: string): Promise<NicknameAdded> {
    const nickname = tidyNickname(text);
    const problem = nicknameProblem(nickname);
    if (problem) return Promise.resolve({ kind: 'refused', problem });
    return this.inTurn(async (): Promise<NicknameAdded> => {
      const owners = this.current().namedBy(nickname);
      const others = owners.filter((owner) => owner.key !== entry.key);
      if (others.length > 0) return { kind: 'taken', nickname, by: others };
      if (owners.length > 0) return { kind: 'already', nickname };
      let nicknames: string[];
      try {
        nicknames = await this.source.addNickname(entry.key, nickname);
      } catch (err) {
        if (err instanceof RangeError) return { kind: 'full', nickname };
        throw err;
      }
      await this.readAfterWrite(entry.key, nicknames);
      return { kind: 'added', nickname, nicknames };
    });
  }

  remove(entry: PokemonEntry, text: string): Promise<boolean> {
    const nickname = tidyNickname(text);
    return this.inTurn(async () => {
      const removed = await this.source.removeNickname(entry.key, nickname);
      if (removed) {
        const left = (this.stored().get(entry.key) ?? []).filter((one) => one !== nickname);
        await this.readAfterWrite(entry.key, left);
      }
      return removed;
    });
  }

  private async read(): Promise<void> {
    this.storedNicknames = await this.source.nicknames();
    this.built = undefined;
  }

  /**
   * Reads the nicknames after a write that succeeded. If only the read fails, the write still
   * stands: the failure is logged and the Pokémon's nicknames in memory are set to `nicknames`.
   */
  private async readAfterWrite(key: string, nicknames: string[]): Promise<void> {
    try {
      await this.read();
    } catch (err) {
      this.log?.warn({ err }, 'could not read the Pokémon nicknames again');
      const patched = mergeNicknames(this.gameData.catalogue, this.storedNicknames);
      patched.set(key, nicknames);
      this.storedNicknames = patched;
      this.built = undefined;
    }
  }

  /** Runs `task` after everything asked for before it, whether that succeeded or not. */
  private inTurn<T>(task: () => Promise<T>): Promise<T> {
    const turn = this.queue.then(task, task);
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  private current(): PokemonSearch {
    const catalogue = this.gameData.catalogue;
    if (this.built?.catalogue !== catalogue) {
      const nicknames = mergeNicknames(catalogue, CURATED_NICKNAMES, this.storedNicknames);
      this.built = { catalogue, search: new PokemonSearch(catalogue, nicknames) };
    }
    return this.built.search;
  }
}
