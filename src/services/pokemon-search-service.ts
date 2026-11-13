import { BoundedMap } from '../bounded-map.js';
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

/**
 * Where the servers' nicknames are kept (`PokemonNicknameRepository`, plan 19B-4): read by
 * server, changed one nickname of one server at a time.
 */
export interface NicknameStore {
  /** The nicknames of these servers, by server and then by catalogue key. */
  nicknamesOf(serverIds: readonly string[]): Promise<Map<string, Map<string, string[]>>>;
  addNickname(serverId: string, key: string, nickname: string): Promise<void>;
  removeNickname(serverId: string, key: string, nickname: string): Promise<boolean>;
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
 * The Pokémon search of each server (plan 19B-4; spec, "Gyms, stops and Wayspots per server":
 * Pokémon nicknames are a server's): the instance's names (the game data and the curated
 * nicknames) with the nicknames that server's staff added. Every caller names its server: a
 * command or control the interaction's (`interaction.guildId`), what is about a party the party's
 * server, a web route its server, a screenshot the report's; in a DM or with no server at all,
 * `null`, the instance's names alone.
 */
export interface PokemonFinders {
  of(serverId: string | null | undefined): PokemonFinder;
}

/**
 * What came of adding a nickname:
 * - `added`: stored; `nicknames` are the Pokémon's nicknames in that server afterwards;
 * - `refused`: the text is no nickname (`NicknameProblem`);
 * - `taken`: it is already the name, an id or a nickname of these other Pokémon in that server;
 * - `already`: it already finds this Pokémon there (its name, an id, or a nickname it has);
 * - `full`: the Pokémon's nicknames in that server would not fit what one Pokémon holds with it.
 */
export type NicknameAdded =
  | { kind: 'added'; nickname: string; nicknames: string[] }
  | { kind: 'refused'; problem: NicknameProblem }
  | { kind: 'taken'; nickname: string; by: PokemonEntry[] }
  | { kind: 'already'; nickname: string }
  | { kind: 'full'; nickname: string };

/** The nicknames a server's staff add for searching (`/admin nickname`). */
export interface PokemonNicknames {
  /**
   * A server's nicknames as last read, by catalogue key, in lower case. Of a server not read yet
   * (one that joined since the start) none, and its read is started in the background, as a
   * search of it starts it, so that the next ask has them.
   */
  stored(serverId: string): ReadonlyMap<string, readonly string[]>;
  /**
   * A server's nicknames as `stored` gives them, read first where they were not yet (a server
   * that joined since the start), in turn with the changes: for what staff are shown as a list.
   */
  readStored(serverId: string): Promise<ReadonlyMap<string, readonly string[]>>;
  /** The nicknames that come with the bot (`CURATED_NICKNAMES`) of an entry. */
  curated(key: string): readonly string[];
  add(serverId: string, entry: PokemonEntry, text: string): Promise<NicknameAdded>;
  /** Whether the Pokémon had that stored nickname there (curated ones cannot be removed). */
  remove(serverId: string, entry: PokemonEntry, text: string): Promise<boolean>;
}

/**
 * The characters one Pokémon's nicknames in a server may take, joined with ", ": what the legacy
 * column held (`Pokemon.nickname`, 255) before they were a server's, so that staff meet the same
 * limit, and a server's nicknames stay bounded.
 */
export const MAX_JOINED_NICKNAMES = 255;

/** How many servers' indexes are kept built at once (`BoundedMap`, the oldest let go). */
const FINDERS_KEPT = 50;

/** The index of a search, made for the catalogue in use. */
interface Built {
  catalogue: PokemonCatalogue;
  search: PokemonSearch;
}

export interface PokemonSearchServiceOptions {
  /** How many servers' indexes are kept built (`FINDERS_KEPT` unless given). */
  findersKept?: number;
}

/**
 * The Pokémon search over the game data in use and the nicknames: the curated list, which is the
 * instance's, and each server's own from the database (plan 19B-4). `load` reads the servers
 * recorded at the start, in one read; a server first asked about later is read then, in the
 * background (until its read is back it has the instance's names alone). A server's index is
 * built when first asked for, rebuilt when its nicknames change or the game data was refreshed,
 * and at most `findersKept` are kept built (`BoundedMap`); its nicknames stay in memory. A server
 * without nicknames of its own is served by the instance's index and keeps none.
 *
 * Reads of the nicknames and the changes staff make run one at a time, in the order they were
 * asked for, so a nickname is looked at for clashes and written without another change between.
 */
export class PokemonSearchService implements PokemonFinders, PokemonNicknames {
  /** Each server's nicknames as last read, by catalogue key: the servers read so far. */
  private readonly nicknames = new Map<string, Map<string, string[]>>();
  /** The servers whose read is under way, or was asked for and has not come back. */
  private readonly reading = new Set<string>();
  private readonly built: BoundedMap<string, Built>;
  private instance: Built | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly gameData: GameDataProvider,
    private readonly source: NicknameStore,
    private readonly log?: Logger,
    options: PokemonSearchServiceOptions = {},
  ) {
    this.built = new BoundedMap(options.findersKept ?? FINDERS_KEPT);
  }

  /**
   * Reads the nicknames of these servers (at the start: the servers recorded), in one read. Until
   * a server's are read, only the curated ones are known there.
   */
  load(serverIds: readonly string[]): Promise<void> {
    return this.inTurn(() => this.read(serverIds));
  }

  /** Waits for every read and change asked for so far (a test's, or the shutdown's). */
  async flush(): Promise<void> {
    await this.queue;
  }

  of(serverId: string | null | undefined): PokemonFinder {
    // Looked up at each call, so that a finder handed out follows the nicknames and game data.
    const current = () => this.current(serverId ?? null);
    return {
      search: (text, options) => current().search(text, options),
      find: (text, options) => current().find(text, options),
      exact: (text) => current().exact(text),
    };
  }

  stored(serverId: string): ReadonlyMap<string, readonly string[]> {
    const own = this.nicknames.get(serverId);
    if (own === undefined) this.readLater(serverId);
    return mergeNicknames(this.gameData.catalogue, own ?? new Map());
  }

  readStored(serverId: string): Promise<ReadonlyMap<string, readonly string[]>> {
    return this.inTurn(async () => {
      await this.readFirst(serverId);
      return this.stored(serverId);
    });
  }

  curated(key: string): readonly string[] {
    return Object.hasOwn(CURATED_NICKNAMES, key) ? (CURATED_NICKNAMES[key] ?? []) : [];
  }

  add(serverId: string, entry: PokemonEntry, text: string): Promise<NicknameAdded> {
    const nickname = tidyNickname(text);
    const problem = nicknameProblem(nickname);
    if (problem) return Promise.resolve({ kind: 'refused', problem });
    return this.inTurn(async (): Promise<NicknameAdded> => {
      // Its clashes are with the server's own nicknames: read them first where they are not.
      await this.readFirst(serverId);
      const owners = this.current(serverId).namedBy(nickname);
      const others = owners.filter((owner) => owner.key !== entry.key);
      if (others.length > 0) return { kind: 'taken', nickname, by: others };
      if (owners.length > 0) return { kind: 'already', nickname };
      const nicknames = [...(this.stored(serverId).get(entry.key) ?? []), nickname];
      if (nicknames.join(', ').length > MAX_JOINED_NICKNAMES) return { kind: 'full', nickname };
      await this.source.addNickname(serverId, entry.key, nickname);
      await this.readAfterWrite(serverId, entry.key, nicknames);
      return { kind: 'added', nickname, nicknames };
    });
  }

  remove(serverId: string, entry: PokemonEntry, text: string): Promise<boolean> {
    const nickname = tidyNickname(text);
    return this.inTurn(async () => {
      // What is left, and a refusal's list, are of the server's own nicknames: read them first.
      await this.readFirst(serverId);
      const removed = await this.source.removeNickname(serverId, entry.key, nickname);
      if (removed) {
        const left = (this.stored(serverId).get(entry.key) ?? []).filter((one) => one !== nickname);
        await this.readAfterWrite(serverId, entry.key, left);
      }
      return removed;
    });
  }

  /** Reads a server's nicknames where they were not read yet (inside a turn). */
  private async readFirst(serverId: string): Promise<void> {
    if (!this.nicknames.has(serverId)) await this.read([serverId]);
  }

  /** Reads these servers' nicknames and lets their indexes go. Rejects when the read fails. */
  private async read(serverIds: readonly string[]): Promise<void> {
    const read = await this.source.nicknamesOf(serverIds);
    for (const serverId of serverIds) {
      this.nicknames.set(serverId, read.get(serverId) ?? new Map<string, string[]>());
      this.built.delete(serverId);
    }
  }

  /**
   * Reads a server's nicknames after a write that succeeded. If only the read fails, the write
   * still stands: the failure is logged and the Pokémon's nicknames in memory are `nicknames`.
   */
  private async readAfterWrite(serverId: string, key: string, nicknames: string[]): Promise<void> {
    try {
      await this.read([serverId]);
    } catch (err) {
      this.log?.warn(
        { err, server: serverId },
        'could not read a server’s Pokémon nicknames again',
      );
      const patched = new Map(this.nicknames.get(serverId) ?? []);
      patched.set(key, nicknames);
      this.nicknames.set(serverId, patched);
      this.built.delete(serverId);
    }
  }

  /**
   * Reads, in the background, a server first asked about that was not read (one that joined
   * since the start); a read that fails is logged and asked again at the next ask.
   */
  private readLater(serverId: string): void {
    if (this.reading.has(serverId)) return;
    this.reading.add(serverId);
    void this.inTurn(() => this.read([serverId]))
      .catch((err: unknown) => {
        this.log?.warn({ err, server: serverId }, 'could not read a server’s Pokémon nicknames');
      })
      .finally(() => this.reading.delete(serverId));
  }

  /** Runs `task` after everything asked for before it, whether that succeeded or not. */
  private inTurn<T>(task: () => Promise<T>): Promise<T> {
    const turn = this.queue.then(task, task);
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  /** The index of a server (null: the instance's names alone), built for the catalogue in use. */
  private current(serverId: string | null): PokemonSearch {
    const catalogue = this.gameData.catalogue;
    if (serverId === null) {
      if (this.instance?.catalogue !== catalogue) {
        this.instance = {
          catalogue,
          search: new PokemonSearch(catalogue, mergeNicknames(catalogue, CURATED_NICKNAMES)),
        };
      }
      return this.instance.search;
    }
    const own = this.nicknames.get(serverId);
    if (own === undefined) {
      // Not read yet: the instance's names, until its read is back.
      this.readLater(serverId);
      return this.current(null);
    }
    // None of its own: the instance's index serves it, and it holds no place among those kept.
    if (own.size === 0) return this.current(null);
    const kept = this.built.get(serverId);
    if (kept?.catalogue === catalogue) return kept.search;
    const search = new PokemonSearch(catalogue, mergeNicknames(catalogue, CURATED_NICKNAMES, own));
    this.built.set(serverId, { catalogue, search });
    return search;
  }
}
