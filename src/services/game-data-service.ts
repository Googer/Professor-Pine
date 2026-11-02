import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import { GAME_DATA_VERSION, parseGameMaster, type GameData } from '../domain/pogo/game-master.js';
import {
  iconNamesOf,
  isTruncatedListing,
  PokemonIcons,
  portraitNamesOf,
} from '../domain/pogo/pokemon-icons.js';
import { parseTextFile } from '../domain/pogo/text.js';
import type { Logger } from '../log.js';
import type { CatchUpOutcome } from './catch-up.js';
import { failureReason } from './failure-reason.js';
import { readLimitedText, type LimitedResponse } from './limited-json.js';
import { fetchOnItsHost } from './same-host-fetch.js';

/** A download that got no answer: the request or its body failed, or ran out of time. */
class DownloadFailure extends Error {}

/** The game master, the largest download, was 20 MB on 2026-11-01. */
export const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

/** The longest delay `setTimeout` accepts; anything longer fires immediately. */
const MAX_TIMER_MS = 2 ** 31 - 1;
const MINUTE_MS = 60_000;

/** The text file always names Pokémon number 1; a download without that name is not the text file. */
const SENTINEL_TEXT_KEY = 'pokemon_name_0001';

/** A refresh with fewer species than this share of the ones in use is refused. */
const MIN_SPECIES_SHARE = 0.9;
/** A refresh in which fewer than this share of species have an English name is refused. */
const MIN_NAMED_SHARE = 0.5;

interface CacheFile {
  version: number;
  fetchedAt: number;
  data: GameData;
  /**
   * The names of the game's icon files that exist, as last downloaded (`PokemonIcons`). Absent
   * in a copy saved before there was a list, or while none could be downloaded: such a copy is
   * as good as any other.
   */
  icons?: string[];
}

/** The part of `fetch` this service needs: `fetchOnItsHost` decides where a redirect goes. */
export type FetchText = (
  url: string,
  init: { signal: AbortSignal; redirect: 'manual' },
) => Promise<LimitedResponse & { ok: boolean }>;

export interface GameDataOptions {
  gameMasterUrl: string;
  textUrl: string;
  /**
   * The listing of the game's picture files (GitHub's tree of PokeMiners' `pogo_assets`,
   * `Images/Pokemon/Addressable Assets`); downloaded with the game data. Without it no list of
   * icons is kept.
   */
  iconsUrl?: string;
  /**
   * The listing of the megas' portraits (PokeMiners' `Images/Mega Portraits 512x512`),
   * downloaded with the icons and kept in the same list: a mega the icon list lacks shows its
   * portrait. Only asked for together with `iconsUrl`.
   */
  megaPortraitsUrl?: string;
  /** Where the parsed data is kept between runs, e.g. `var/game-data-cache.json`. */
  cachePath: string;
  /** A cache older than this is refreshed when the bot starts, and the data is refreshed this often. */
  maxAgeMs: number;
  fetch: FetchText;
  log: Logger;
  now?: () => number;
  /** How long one download may take before it is abandoned. Default 30 seconds. */
  timeoutMs?: number;
  /** How long to wait before trying again after a failed or stale start. Default 30 minutes. */
  retryMs?: number;
}

/** What handlers need: the current catalogue, and the icons of Pokémon that exist. */
export interface GameDataProvider {
  readonly catalogue: PokemonCatalogue;
  /**
   * The game's icon files that exist, for the picture of a Pokémon the raid boss feed has none
   * of (`pokemonPicture`). Undefined while no list could be downloaded: only the feed's
   * pictures are shown then.
   */
  readonly icons?: PokemonIcons | undefined;
}

let temporaryCounter = 0;

/**
 * Downloads the game master and English text file, parses them and keeps the result on disk,
 * so the bot still starts when the download fails. Nothing happens until `load` is called.
 *
 * With them it downloads the list of the game's icon files (`iconsUrl`) and keeps the icon
 * names in the same saved copy. That list is an extra: when it cannot be downloaded or read
 * the game data is used and saved all the same, with the list of the last time, or none.
 * A list that is owed (the saved copy the bot started from has none, or its last download
 * failed) is asked for alone, without the game master: on the side when the bot starts from a
 * fresh copy, and `retryMs` after a failure while the automatic refresh runs; the saved copy is
 * then written again with it (never at the same time as a refresh writes it: the writes of the
 * copy go one after the other). A listing that GitHub cut short never takes names away: the list
 * in use is kept and the new names are added.
 */
export class GameDataService implements GameDataProvider {
  private current: PokemonCatalogue | undefined;
  private iconList: PokemonIcons | undefined;
  /** Whether the last download of the list of icons failed: it is asked for again alone. */
  private iconsFailed = false;
  /** Whether the last download of the megas' portraits failed: the list is asked for again. */
  private portraitsFailed = false;
  /** The copy in use as it was saved, or would be: written again when a list arrives alone. */
  private saved: CacheFile | undefined;
  private loadedAt = 0;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly retryMs: number;
  private inFlight: Promise<boolean> | undefined;
  private iconsInFlight: Promise<boolean> | undefined;
  /**
   * The write of the saved copy that is last in line. The copy has two writers (a refresh of
   * the game data, and the list of icons that arrives alone): their writes go one after the
   * other in the order they were asked for, so that an older copy never lands on a newer one.
   */
  private writing: Promise<void> = Promise.resolve();
  private lastFailure: string | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(private readonly options: GameDataOptions) {
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retryMs = options.retryMs ?? 30 * MINUTE_MS;
  }

  /** The catalogue in use. Throws before the first successful `load`. */
  get catalogue(): PokemonCatalogue {
    if (!this.current) throw new Error('Game data has not been loaded yet');
    return this.current;
  }

  /** The icon files that exist, as last downloaded or saved; undefined when there is no list. */
  get icons(): PokemonIcons | undefined {
    return this.iconList;
  }

  /** When the data in use was downloaded (epoch ms); 0 before `load`. */
  get fetchedAt(): number {
    return this.loadedAt;
  }

  /**
   * Makes a catalogue available: from the cache when it is fresh, otherwise from a new
   * download, falling back to a stale cache. Throws only when there is neither.
   */
  async load(): Promise<void> {
    const cached = await this.readCache();
    // The saved list of icons is the last one there is, however old the copy: it stays in use
    // (and is saved again) when the download that follows brings none.
    if (cached?.icons) this.iconList = cached.icons;
    // A copy dated in the future (the clock went back) is out of date but still usable.
    const age = cached ? this.now() - cached.cache.fetchedAt : 0;
    if (cached && age >= 0 && age < this.options.maxAgeMs) {
      this.use(cached.cache, cached.catalogue, cached.icons);
      // A copy without a list (saved before there was one, or while it could not be had): the
      // list is fetched now, alone and on the side. The bot does not wait for it.
      if (this.iconsOwed) void this.refreshIcons();
      return;
    }
    if (await this.refresh()) return;
    if (!cached) {
      throw new Error(
        `Could not download the game data (${this.lastFailure ?? 'unknown reason'}) and there is no saved copy at ${this.options.cachePath}`,
      );
    }
    this.options.log.warn(
      { fetchedAt: new Date(cached.cache.fetchedAt).toISOString() },
      `using the saved game data, which is out of date; retry in ${Math.round(this.retryMs / MINUTE_MS)} minutes`,
    );
    this.use(cached.cache, cached.catalogue, cached.icons);
  }

  /**
   * Downloads and parses the latest data and, if it is valid, switches to it and saves it.
   * Returns false, keeping whatever was in use, when the download or the data is bad.
   * Calls made while one is running share its result.
   */
  refresh(): Promise<boolean> {
    this.inFlight ??= this.refreshOnce().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /**
   * Whether the list of icons should be asked for by itself: an address is configured, and
   * there is no list, its last download failed, or the megas' portraits are configured and the
   * list has none (a copy saved before they were read: the staging of 2026-10-23).
   */
  private get iconsOwed(): boolean {
    const portraitsMissing =
      this.options.megaPortraitsUrl !== undefined && (this.iconList?.portraits().size ?? 0) === 0;
    return (
      this.options.iconsUrl !== undefined &&
      (this.iconList === undefined || this.iconsFailed || this.portraitsFailed || portraitsMissing)
    );
  }

  /**
   * Downloads the list of icons alone, without the game data, and writes the saved copy again
   * with it. False, keeping what was in use, when the download or the listing is bad. Never
   * rejects; calls made while one is running share its result.
   */
  refreshIcons(): Promise<boolean> {
    this.iconsInFlight ??= this.refreshIconsOnce()
      .catch((err: unknown) => {
        this.options.log.warn({ err }, 'could not keep the list of Pokémon icons');
        return false;
      })
      .finally(() => {
        this.iconsInFlight = undefined;
      });
    return this.iconsInFlight;
  }

  private async refreshIconsOnce(): Promise<boolean> {
    const icons = await this.downloadIcons();
    if (!icons) return false;
    this.iconList = icons;
    // A refresh of the game data that is running saves the list itself when it ends.
    await this.inFlight?.catch(() => undefined);
    const saved = this.saved;
    if (saved && this.iconList === icons) {
      saved.icons = icons.names();
      await this.writeCache(saved);
    }
    return true;
  }

  /** Resolves once no refresh is in flight (at once when none is). Never rejects. For shutdown and tests. */
  async whenIdle(): Promise<void> {
    while (this.inFlight || this.iconsInFlight) {
      await this.inFlight?.catch(() => undefined);
      await this.iconsInFlight?.catch(() => undefined);
    }
  }

  /**
   * Schedules the next refresh: when the data in use reaches `maxAgeMs`, or `retryMs` from now
   * when it is already older or the last attempt failed; and again after every attempt.
   * While the list of icons is owed and the data itself is fresh, the list alone is asked for
   * `retryMs` from now (or when the data is due, if that is sooner).
   * Calling it again while a refresh is scheduled changes nothing.
   */
  startAutoRefresh(): void {
    this.stopped = false;
    if (this.timer) return;
    this.schedule();
  }

  /**
   * The gateway is back after a real disconnect (plan 8X-H, review R1): when the last refresh
   * failed, the game data is downloaded now instead of at the retry half an hour on (the list of
   * icons alone when only it failed), through the guards of `refresh` and `refreshIcons` (one
   * the timer started meanwhile is waited for first, and decides), and the next scheduled from
   * this one; else nothing is owed and nothing is asked. Never rejects.
   */
  async catchUp(): Promise<CatchUpOutcome> {
    await this.whenIdle();
    const dataOwed = this.lastFailure !== undefined;
    if (this.stopped || (!dataOwed && !this.iconsFailed)) {
      return 'not-owed';
    }
    // The scheduled refresh is this one: cleared, then set again from it.
    const scheduled = this.timer !== undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const ok = dataOwed ? await this.refresh() : await this.refreshIcons();
    if (scheduled && !this.stopped && !this.timer) this.schedule();
    return ok ? 'done' : 'failed';
  }

  /** Cancels the scheduled refresh. One already running finishes but schedules nothing. */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** How long until the data in use is a full period old; undefined when it is due or failed. */
  private freshFor(): number | undefined {
    const age = this.now() - this.loadedAt;
    const fresh =
      this.lastFailure === undefined && this.loadedAt > 0 && age < this.options.maxAgeMs;
    return fresh ? this.options.maxAgeMs - age : undefined;
  }

  /** What the timer does: the whole refresh when the data is due, else the list when owed. */
  private due(): Promise<boolean> {
    if (this.freshFor() === undefined) return this.refresh();
    return this.iconsOwed ? this.refreshIcons() : Promise.resolve(true);
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    const freshFor = this.freshFor();
    const wait =
      freshFor === undefined
        ? this.retryMs
        : this.iconsOwed
          ? Math.min(freshFor, this.retryMs)
          : freshFor;
    const delay = Math.min(wait, MAX_TIMER_MS);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.due()
        .catch((err: unknown) => {
          this.lastFailure = err instanceof Error ? err.message : String(err);
          try {
            this.options.log.error({ err }, 'game data refresh failed unexpectedly');
          } catch {
            // A broken logger must not stop the next refresh from being scheduled.
          }
        })
        .finally(() => {
          if (!this.stopped) this.schedule();
        });
    }, delay);
    this.timer.unref();
  }

  private async refreshOnce(): Promise<boolean> {
    let cache: CacheFile;
    let catalogue: PokemonCatalogue;
    // Beside the game data, and never in its way: it resolves with a list or with nothing.
    const listed = this.downloadIcons();
    try {
      const [gameMaster, textFile] = await Promise.all([
        this.download(this.options.gameMasterUrl),
        this.download(this.options.textUrl),
      ]);
      const text = parseTextFile(textFile);
      if (!text.has(SENTINEL_TEXT_KEY)) {
        throw new Error(`${this.options.textUrl} is not the game's text file`);
      }
      const data = parseGameMaster(JSON.parse(gameMaster) as unknown, text, (message) =>
        this.options.log.warn({ detail: message }, 'game data warning'),
      );
      catalogue = new PokemonCatalogue(data);
      this.checkNotDegraded(catalogue, text);
      cache = { version: GAME_DATA_VERSION, fetchedAt: this.now(), data };
    } catch (err) {
      this.lastFailure = err instanceof Error ? err.message : String(err);
      // A download that never got an answer (the network away, a time limit) is tried again by
      // itself: a warning (plan 8X-H). Data that is wrong needs a person.
      if (err instanceof DownloadFailure) {
        this.options.log.warn({ err }, 'could not refresh the game data');
      } else {
        this.options.log.error({ err }, 'could not refresh the game data');
      }
      // A newer list of icons is used all the same; it is saved with the next good refresh.
      this.iconList = (await listed) ?? this.iconList;
      return false;
    }
    this.lastFailure = undefined;
    this.use(cache, catalogue, await listed);
    // The list in use is saved with the data: the new one, or the one of the last time.
    if (this.iconList) cache.icons = this.iconList.names();
    this.options.log.info(
      { pokemon: cache.data.pokemon.length, moves: cache.data.moves.length },
      'game data refreshed',
    );
    await this.writeCache(cache);
    return true;
  }

  /** Throws when the new data is much poorer than what is in use or than it should be. */
  private checkNotDegraded(catalogue: PokemonCatalogue, texts: Map<string, string>): void {
    const species = catalogue.all.filter((entry) => entry.kind === 'species');
    if (this.current) {
      const inUse = this.current.all.filter((entry) => entry.kind === 'species').length;
      if (species.length < inUse * MIN_SPECIES_SHARE) {
        throw new Error(
          `the new game master has ${species.length} species against ${inUse} in use (less than ${MIN_SPECIES_SHARE * 100}%)`,
        );
      }
    }
    const named = species.filter((entry) =>
      texts.has(`pokemon_name_${String(entry.dex).padStart(4, '0')}`),
    ).length;
    if (named < species.length * MIN_NAMED_SHARE) {
      throw new Error(
        `only ${named} of ${species.length} species have an English name in the text file (less than ${MIN_NAMED_SHARE * 100}%)`,
      );
    }
  }

  private use(cache: CacheFile, catalogue: PokemonCatalogue, icons?: PokemonIcons): void {
    this.current = catalogue;
    this.saved = cache;
    this.loadedAt = cache.fetchedAt;
    // Without a list of its own (the download failed, an older saved copy) the one in use stays.
    if (icons) this.iconList = icons;
  }

  /**
   * Downloads the list of icon files and, beside it, the megas' portraits (`megaPortraitsUrl`),
   * as one list. Never rejects: undefined when no address is configured, and when neither
   * listing could be read. A listing that fails keeps its part of the list in use: a failed
   * portrait listing never empties the icons, nor the reverse.
   */
  private async downloadIcons(): Promise<PokemonIcons | undefined> {
    const { iconsUrl } = this.options;
    if (iconsUrl === undefined) return undefined;
    const [icons, portraits] = await Promise.all([
      this.downloadIconListing(iconsUrl),
      this.downloadPortraits(),
    ]);
    if (!icons && !portraits) return undefined;
    const iconPart = icons ?? this.iconList?.iconsOnly();
    const portraitPart = portraits ?? this.iconList?.portraits();
    return new PokemonIcons([...(iconPart?.names() ?? []), ...(portraitPart?.names() ?? [])]);
  }

  /**
   * The listing of icon files: undefined when the download or the listing is bad, which is
   * logged as a warning (the bot then shows the pictures it showed before) and remembered
   * (`iconsFailed`: it is asked for again). A listing that was cut short is said, and gives the
   * list in use with its names added: names that are missing from it are not taken to be gone.
   */
  private async downloadIconListing(iconsUrl: string): Promise<PokemonIcons | undefined> {
    const { log } = this.options;
    try {
      const listing = JSON.parse(await this.download(iconsUrl)) as unknown;
      const listed = new PokemonIcons(iconNamesOf(listing));
      this.iconsFailed = false;
      if (!isTruncatedListing(listing)) {
        // Said for every download, with the game data or alone: the pictures rest on it.
        log.info({ icons: listed.size }, 'the list of Pokémon icons was downloaded');
        return listed;
      }
      const icons = this.iconList ? this.iconList.iconsOnly().with(listed) : listed;
      log.warn(
        { listed: listed.size, icons: icons.size },
        'the list of Pokémon icons was cut short',
      );
      return icons;
    } catch (err) {
      this.iconsFailed = true;
      log.warn(
        { err, kept: this.iconList?.iconsOnly().size ?? 0 },
        'could not download the list of Pokémon icons',
      );
      return undefined;
    }
  }

  /** The listing of the megas' portraits, as `downloadIconListing` reads the icons'. */
  private async downloadPortraits(): Promise<PokemonIcons | undefined> {
    const { megaPortraitsUrl, log } = this.options;
    if (megaPortraitsUrl === undefined) return undefined;
    try {
      const listing = JSON.parse(await this.download(megaPortraitsUrl)) as unknown;
      const listed = new PokemonIcons(portraitNamesOf(listing));
      this.portraitsFailed = false;
      if (!isTruncatedListing(listing)) {
        log.info({ portraits: listed.size }, 'the list of mega portraits was downloaded');
        return listed;
      }
      const portraits = this.iconList ? this.iconList.portraits().with(listed) : listed;
      log.warn(
        { listed: listed.size, portraits: portraits.size },
        'the list of mega portraits was cut short',
      );
      return portraits;
    } catch (err) {
      this.portraitsFailed = true;
      log.warn(
        { err, kept: this.iconList?.portraits().size ?? 0 },
        'could not download the list of mega portraits',
      );
      return undefined;
    }
  }

  private async download(url: string): Promise<string> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    let response: Awaited<ReturnType<FetchText>>;
    try {
      response = await fetchOnItsHost(this.options.fetch, url, { signal, redirect: 'manual' });
    } catch (err) {
      throw this.downloadFailure(url, err, signal);
    }
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    let read: Awaited<ReturnType<typeof readLimitedText>>;
    try {
      read = await readLimitedText(response, MAX_DOWNLOAD_BYTES);
    } catch (err) {
      throw this.downloadFailure(url, err, signal);
    }
    if (read.ok) return read.text;
    throw new Error(
      read.reason === 'too-large'
        ? `${url} sent more than ${MAX_DOWNLOAD_BYTES} bytes`
        : `${url} sent no text`,
    );
  }

  /** undici's `fetch failed` hides the real reason in `cause`; say which address failed and why. */
  private downloadFailure(url: string, err: unknown, signal: AbortSignal): Error {
    const reason = signal.aborted ? `timed out after ${this.timeoutMs} ms` : failureReason(err);
    return new DownloadFailure(`${url}: ${reason}`, { cause: err });
  }

  /** A saved copy is usable only if it has the current version, is complete and builds a catalogue. */
  private async readCache(): Promise<
    { cache: CacheFile; catalogue: PokemonCatalogue; icons: PokemonIcons | undefined } | undefined
  > {
    try {
      const cache = JSON.parse(
        await readFile(this.options.cachePath, 'utf8'),
      ) as Partial<CacheFile>;
      const data = cache.data as Partial<GameData> | undefined;
      if (
        cache.version !== GAME_DATA_VERSION ||
        typeof cache.fetchedAt !== 'number' ||
        !Array.isArray(data?.pokemon) ||
        data.pokemon.length === 0 ||
        typeof data.aliases !== 'object' ||
        data.aliases === null ||
        !Array.isArray(data.moves) ||
        data.moves.length === 0 ||
        !Array.isArray(data.cpMultipliers) ||
        data.cpMultipliers.length === 0 ||
        typeof data.typeChart !== 'object' ||
        data.typeChart === null ||
        typeof data.weatherBoosts !== 'object' ||
        data.weatherBoosts === null
      ) {
        return undefined;
      }
      // The list of icons is an extra: a copy without one, or with one that is no list of
      // names, is used without it.
      const names: unknown = cache.icons;
      const icons =
        Array.isArray(names) && names.every((name) => typeof name === 'string')
          ? new PokemonIcons(names)
          : undefined;
      return {
        cache: cache as CacheFile,
        catalogue: new PokemonCatalogue(data as GameData),
        icons: icons && icons.size > 0 ? icons : undefined,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Saves the copy after every write asked for before it (`writing`). Never rejects: a failed
   * save is logged, the data in memory is still good.
   */
  private writeCache(cache: CacheFile): Promise<void> {
    const write = this.writing.then(() => this.writeCacheNow(cache));
    this.writing = write;
    return write;
  }

  private async writeCacheNow(cache: CacheFile): Promise<void> {
    const temporary = `${this.options.cachePath}.${process.pid}.${++temporaryCounter}.tmp`;
    try {
      await mkdir(path.dirname(this.options.cachePath), { recursive: true });
      await writeFile(temporary, JSON.stringify(cache));
      await rename(temporary, this.options.cachePath);
    } catch (err) {
      await rm(temporary, { force: true }).catch(() => undefined);
      this.options.log.warn({ err, path: this.options.cachePath }, 'could not save the game data');
    }
  }
}
