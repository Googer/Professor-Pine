import type { RocketLineupStorage } from '../db/repositories/rocket-lineup-repository.js';
import { parseRocketLineups, type RocketChoice } from '../domain/rocket/lineups.js';
import { lineupPictureSources } from '../domain/stops/pictures.js';
import type { Logger } from '../log.js';
import type { CatchUpOutcome } from './catch-up.js';
import { failureReason } from './failure-reason.js';
import type { GameDataProvider } from './game-data-service.js';
import { readLimitedJson } from './limited-json.js';
import { PINE_USER_AGENT, type FetchPage, type PictureMaking } from './research-task-service.js';

/** The feed was 38 KB on 2026-10-22; anything much larger is not the feed. */
export const MAX_ROCKET_FEED_BYTES = 1024 * 1024;

const MINUTE_MS = 60_000;
/** The longest delay `setTimeout` accepts. */
const MAX_TIMER_MS = 2 ** 31 - 1;

export interface RocketLineupOptions {
  /** ScrapedDuck's Rocket lineups (`settings.rocket.url`). */
  url: string;
  refreshMs: number;
  /** A list not read anew for this long is out of date (logged once). */
  staleAfterMs: number;
  store: RocketLineupStorage;
  gameData: GameDataProvider;
  fetch: FetchPage;
  log: Logger;
  /** How long one download may take. Default 30 seconds. */
  timeoutMs?: number;
  /** How long to wait after a failed attempt. Default 15 minutes, at most `refreshMs`. */
  retryMs?: number;
  now?: () => number;
  /**
   * The square pictures of the stops (plan 8M-9B, `StopPictures.prepare`): every catch's picture
   * of a list taken, the portraits and the encounter picture are made, not waited for.
   */
  pictures?: PictureMaking;
}

/** What handlers need: `/rocket`'s choices of now. */
export interface RocketLineupProvider {
  /** The choices of the last good read, in their order; empty while none was ever read. */
  choices(): readonly RocketChoice[];
  /** A choice by its key (`grunt:water`), if the list has it. */
  byKey(key: string): RocketChoice | undefined;
  /** When the list in use was read, epoch milliseconds; undefined while none was. */
  readAt(): number | undefined;
  /**
   * Whether the list is out of date at `now`: none was read, or not anew for `staleAfterMs`
   * (the rule the log's warning follows; the map's pick list says it, plan 8R-3).
   */
  stale(now: number): boolean;
}

export type RocketRefresh =
  | { status: 'updated'; choices: number }
  /** The feed could not be read, or was not the feed: the list in use is unchanged. */
  | { status: 'failed'; reason: string }
  /** The feed listed fewer than half the choices of the list in use: kept. */
  | { status: 'kept'; choices: number; read: number };

/** Thrown inside a download that `stop` ended; not worth a warning. */
class RefreshStopped extends Error {}

/**
 * Team GO Rocket's lineups (plan 8R-2; design 5.1): ScrapedDuck's feed, read every `refreshMs`
 * with Pine's User-Agent and a byte cap, the last good list kept in the database
 * (`RocketLineupStorage`) so that a start without the network still offers it, as the research
 * task list is kept (`ResearchTaskService`, whose guard this repeats): a read that lists fewer
 * than half the choices of the list in use is a warning and the list stays, unless the read
 * before it listed the very same choices or the list in use is older than `staleAfterMs`; a feed
 * of no lineup at all is a failed read (`parseRocketLineups` throws), so it never empties the
 * list; a list not read anew for `staleAfterMs` is said once in the log.
 */
export class RocketLineupService implements RocketLineupProvider {
  private current: readonly RocketChoice[] = [];
  private keyed = new Map<string, RocketChoice>();
  private read: number | undefined;
  private readonly timeoutMs: number;
  private readonly retryMs: number;
  private readonly now: () => number;
  private controller: AbortController | undefined;
  private inFlight: Promise<RocketRefresh> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  /** Whether the last read failed (not for a stop): the catch-up reads it again. */
  private owed = false;
  private staleTold = false;
  /** The keys of the last read refused as much smaller (`shrinkAgreed`); a read clears it. */
  private shrink: string | undefined;

  constructor(private readonly options: RocketLineupOptions) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retryMs = Math.min(options.retryMs ?? 15 * MINUTE_MS, options.refreshMs);
    this.now = options.now ?? (() => Date.now());
  }

  choices(): readonly RocketChoice[] {
    return this.current;
  }

  byKey(key: string): RocketChoice | undefined {
    return this.keyed.get(key);
  }

  readAt(): number | undefined {
    return this.read;
  }

  stale(now: number): boolean {
    return this.read === undefined || now - this.read >= this.options.staleAfterMs;
  }

  /** Takes the list kept by the last run (no network). */
  async load(): Promise<void> {
    const kept = await this.options.store.kept();
    this.use(kept.choices, kept.readAt);
    this.options.log.info({ choices: kept.choices.length }, 'Rocket lineups loaded');
  }

  private use(choices: readonly RocketChoice[], readAt: number | undefined): void {
    this.current = choices;
    this.keyed = new Map(choices.map((choice) => [choice.key, choice]));
    this.read = readAt;
    // Its pictures made square in the background (plan 8M-9B, B1), behind those a post or a DM
    // waits for (branch review W5); `prepare` never rejects.
    void this.options.pictures?.prepare(lineupPictureSources(choices), { background: true });
  }

  /** Reads the feed now. Never rejects; calls made while one runs share its result. */
  refresh(): Promise<RocketRefresh> {
    this.inFlight ??= this.refreshOnce()
      .then((result) => {
        this.owed = result.status === 'failed' && result.reason !== 'stopped';
        return result;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  /** Resolves once no read is in flight. Never rejects. */
  async whenIdle(): Promise<void> {
    while (this.inFlight) await this.inFlight;
  }

  /**
   * Reads the feed when the list in use is older than `refreshMs` (or there is none), else when
   * it is due, and again every `refreshMs`. Calling it again changes nothing.
   */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const age = this.read === undefined ? Infinity : this.now() - this.read;
    this.schedule(Math.max(0, this.options.refreshMs - age));
  }

  /**
   * The gateway is back after a real disconnect (plan 8X-H, review R1): when the last read
   * failed, the feed is read now instead of at the retry, through `refresh`'s guard (a read the
   * timer started meanwhile is waited for first, and decides), and the next read scheduled
   * from this one; else nothing is owed and nothing is asked. Never rejects.
   */
  async catchUp(): Promise<CatchUpOutcome> {
    if (this.stopped) return 'not-owed';
    await this.whenIdle();
    if (!this.owed) return 'not-owed';
    // The scheduled read is this one: cleared, then set again from it.
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const result = await this.refresh();
    const failed = result.status === 'failed';
    if (!this.stopped && !this.timer) {
      this.schedule(failed ? this.retryMs : this.options.refreshMs);
    }
    return failed ? 'failed' : 'done';
  }

  /** Cancels the scheduled read and ends one in flight. */
  stop(): void {
    this.stopped = true;
    this.controller?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.refresh().then((result) => {
          if (this.stopped) return;
          this.schedule(result.status === 'failed' ? this.retryMs : this.options.refreshMs);
        });
      },
      Math.min(delayMs, MAX_TIMER_MS),
    );
    this.timer.unref();
  }

  private async refreshOnce(): Promise<RocketRefresh> {
    const { log, store, gameData } = this.options;
    let result: RocketRefresh;
    try {
      const parsed = parseRocketLineups(await this.download(), gameData.catalogue);
      const before = this.current.length;
      const shrunk = parsed.choices
        .map((choice) => choice.key)
        .sort()
        .join(' ');
      if (parsed.choices.length * 2 < before && !this.shrinkAgreed(shrunk)) {
        this.shrink = shrunk;
        log.warn(
          { read: parsed.choices.length, kept: before },
          'the Rocket lineups list fewer than half the choices they did; the list is kept',
        );
        result = { status: 'kept', choices: before, read: parsed.choices.length };
      } else {
        const at = this.now();
        await store.replace(parsed.choices, at);
        this.use(parsed.choices, at);
        this.shrink = undefined;
        this.staleTold = false;
        if (parsed.unknown.length > 0) {
          log.info({ pokemon: parsed.unknown }, 'Rocket catches the game data does not know');
        }
        if (parsed.skipped > 0) {
          log.warn({ skipped: parsed.skipped }, 'lineups of the Rocket feed could not be read');
        }
        log.info({ choices: parsed.choices.length }, 'Rocket lineups read');
        result = { status: 'updated', choices: parsed.choices.length };
      }
    } catch (err) {
      if (err instanceof RefreshStopped) return { status: 'failed', reason: 'stopped' };
      log.warn({ err }, 'could not read the Rocket lineups');
      result = { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
    }
    this.tellIfStale();
    return result;
  }

  /**
   * Whether a much smaller list is taken after all: the read before it listed the very same
   * choices (the feed did shrink), or the list in use is out of date anyway (older than
   * `staleAfterMs`): a real shrink is never refused for good.
   */
  private shrinkAgreed(shrunk: string): boolean {
    if (this.shrink === shrunk) return true;
    return this.read !== undefined && this.stale(this.now());
  }

  /** Says once in the log that the list is out of date, until a read succeeds again. */
  private tellIfStale(): void {
    if (this.staleTold || !this.stale(this.now())) return;
    const read = this.read;
    this.staleTold = true;
    this.options.log.warn(
      { readAt: read === undefined ? null : new Date(read).toISOString() },
      'the Rocket lineups are out of date',
    );
  }

  private async download(): Promise<unknown> {
    const { url } = this.options;
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await this.options.fetch(url, {
        signal: AbortSignal.any([timeout, controller.signal]),
        headers: { Accept: 'application/json', 'User-Agent': PINE_USER_AGENT },
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
      const body = await readLimitedJson(response, MAX_ROCKET_FEED_BYTES);
      if (!body.ok) throw new Error(`${url}: the feed is ${body.reason}`);
      return body.value;
    } catch (err) {
      if (controller.signal.aborted) throw new RefreshStopped('stopped', { cause: err });
      if (timeout.aborted) {
        throw new Error(`${url}: timed out after ${String(this.timeoutMs)} ms`, { cause: err });
      }
      if (err instanceof Error && err.message.startsWith(url)) throw err;
      throw new Error(`${url}: ${failureReason(err)}`, { cause: err });
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }
}
