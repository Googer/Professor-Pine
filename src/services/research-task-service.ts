import type { ResearchTaskStorage } from '../db/repositories/research-task-repository.js';
import { parseResearchPage } from '../domain/research/leekduck.js';
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import {
  eventTasksFirst,
  isEventCategory,
  taskOffered,
  type ResearchTask,
} from '../domain/research/task.js';
import { taskPictureSources } from '../domain/stops/pictures.js';
import {
  versionIndex,
  type FoundVersion,
  type TaskVersion,
  type VersionIndex,
} from '../domain/research/versions.js';
import type { Logger } from '../log.js';
import type { CatchUpOutcome } from './catch-up.js';
import { failureReason } from './failure-reason.js';
import type { GameDataProvider } from './game-data-service.js';
import { readLimitedText, type LimitedResponse } from './limited-json.js';
import { fetchOnItsHost } from './same-host-fetch.js';

/** How Pine names itself to the sites it reads. */
export const PINE_USER_AGENT = 'Professor-Pine';

/** The page was 220 KB on 2026-10-21; anything much larger is not the page. */
export const MAX_RESEARCH_PAGE_BYTES = 3 * 1024 * 1024;

const MINUTE_MS = 60_000;
/** The longest delay `setTimeout` accepts. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** The part of `fetch` this service needs: `fetchOnItsHost` decides where a redirect goes. */
export type FetchPage = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string>; redirect: 'manual' },
) => Promise<LimitedResponse & { ok: boolean }>;

export interface ResearchTaskOptions {
  /** Leek Duck's research page (`settings.research.url`). */
  url: string;
  /**
   * The instance's default zone (`instanceZone`): an event's end on the page is a local time,
   * kept as such (`endsLocal`) with its moment in this zone (plan 19A-2).
   */
  zone: string;
  refreshMs: number;
  /** A list not read anew for this long is out of date (logged once). */
  staleAfterMs: number;
  store: ResearchTaskStorage;
  gameData: GameDataProvider;
  fetch: FetchPage;
  log: Logger;
  /** How long one download may take. Default 30 seconds. */
  timeoutMs?: number;
  /** How long to wait after a failed attempt. Default 15 minutes, at most `refreshMs`. */
  retryMs?: number;
  now?: () => number;
  /**
   * The square pictures of the stops (plan 8M-9B, `StopPictures.prepare`): every reward's picture
   * of a list taken is made, not waited for, so that the map's views name the square ones.
   */
  pictures?: PictureMaking;
}

/**
 * What a list's reader asks of `StopPictures`: its pictures made, never waited for, in the
 * background (`background`: behind those a post or a DM waits for, branch review W5).
 */
export interface PictureMaking {
  /** Never rejects. */
  prepare(sources: Iterable<string>, how?: { background?: boolean }): Promise<void>;
}

/** What handlers need: the task list of now. */
export interface ResearchTaskProvider {
  /**
   * The tasks of the last good read as they are offered now, an event's first (plan 8R-8), each
   * part in the page's order, none past its event's end (Leek Duck's page may still list them)
   * in `zone` (a server's, plan 19A-2: the end on its clock; the instance's default without one);
   * empty while none was ever read.
   */
  tasks(zone?: string): readonly ResearchTask[];
  /** A task by its key, if the list has it, its event over or not: what was picked or reported. */
  byKey(key: string): ResearchTask | undefined;
  /** When the list in use was read, epoch milliseconds; undefined while none was. */
  readAt(): number | undefined;
  /**
   * Whether the list is out of date at `now`: none was read, or not anew for `staleAfterMs`
   * (the rule the log's warning follows; the map's pick list says it, plan 8R-3).
   */
  stale(now: number): boolean;
  /**
   * The versions of a task (plan 8R-5, R1: one per reward, then "one of" its encounters), worked
   * out once per list and game data; the autocomplete, `readTask`, the map's options and "Same
   * task at more stops…" read only these.
   */
  versions(task: ResearchTask): readonly TaskVersion[];
  /** A version of the list by its value (`<task>:<hash>`, or a task's key), with its task. */
  byVersion(value: string): FoundVersion | undefined;
}

export type ResearchRefresh =
  | { status: 'updated'; tasks: number }
  /** The page could not be read, or was not the page: the list in use is unchanged. */
  | { status: 'failed'; reason: string }
  /** The page listed fewer than half the tasks of the list in use: kept (design 4.1). */
  | { status: 'kept'; tasks: number; read: number };

/** Thrown inside a download that `stop` ended; not worth a warning. */
class RefreshStopped extends Error {}

/**
 * The field research task list (plan 8R-1; design 4.1): Leek Duck's research page, read by
 * Pine itself every `refreshMs` (`parseResearchPage`) with Pine's User-Agent and a byte cap, the
 * last good list kept in the database (`ResearchTaskStorage`) so that a start without the
 * network still offers it. A read that lists fewer than half the tasks of the list in use may be
 * a page that changed shape: it is logged as a warning and the list stays, unless the read
 * before it listed the very same tasks or the list in use is older than `staleAfterMs` (then
 * the page did shrink, and the smaller list is taken: review A3). A list not read anew
 * for `staleAfterMs` is said to be out of date in the log, once until a read succeeds again.
 * The list offered in a period is whatever the page shows when read, an event's own tasks first
 * (`eventTasksFirst` in `use()`, plan 8R-8; their headings logged at each read, review 8R8-3).
 */
export class ResearchTaskService implements ResearchTaskProvider {
  private current: readonly ResearchTask[] = [];
  private keyed = new Map<string, ResearchTask>();
  private read: number | undefined;
  private readonly timeoutMs: number;
  private readonly retryMs: number;
  private readonly now: () => number;
  private controller: AbortController | undefined;
  private inFlight: Promise<ResearchRefresh> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  /** Whether the last read failed (not for a stop): the catch-up reads it again. */
  private owed = false;
  private staleTold = false;
  /** The task keys of the last read refused as much smaller (`shrinkAgreed`); a read clears it. */
  private shrink: string | undefined;
  /** The versions of the list in use, with the list and catalogue they were worked out of. */
  private indexed:
    | { tasks: readonly ResearchTask[]; catalogue: PokemonCatalogue; index: VersionIndex }
    | undefined;

  constructor(private readonly options: ResearchTaskOptions) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retryMs = Math.min(options.retryMs ?? 15 * MINUTE_MS, options.refreshMs);
    this.now = options.now ?? (() => Date.now());
  }

  tasks(zone?: string): readonly ResearchTask[] {
    const now = this.now();
    return this.current.every((task) => taskOffered(task, now, zone))
      ? this.current
      : this.current.filter((task) => taskOffered(task, now, zone));
  }

  byKey(key: string): ResearchTask | undefined {
    return this.keyed.get(key);
  }

  readAt(): number | undefined {
    return this.read;
  }

  stale(now: number): boolean {
    return this.read === undefined || now - this.read >= this.options.staleAfterMs;
  }

  versions(task: ResearchTask): readonly TaskVersion[] {
    return this.index().of(task);
  }

  byVersion(value: string): FoundVersion | undefined {
    return this.index().byValue(value);
  }

  /**
   * The versions of the list in use, worked out again only when the list or the game data
   * changed (a costume is told by the catalogue: R1).
   */
  private index(): VersionIndex {
    const { catalogue } = this.options.gameData;
    if (this.indexed?.tasks !== this.current || this.indexed.catalogue !== catalogue) {
      this.indexed = {
        tasks: this.current,
        catalogue,
        index: versionIndex(this.current, catalogue),
      };
    }
    return this.indexed.index;
  }

  /** Takes the list kept by the last run (no network). */
  async load(): Promise<void> {
    const kept = await this.options.store.kept();
    this.use(kept.tasks, kept.readAt);
    this.options.log.info({ tasks: kept.tasks.length }, 'research tasks loaded');
  }

  /**
   * Sets the list in use, an event's tasks first (plan 8R-8, `eventTasksFirst`): the pick
   * lists, the map's and `/want`'s follow it, whatever order the page or the store gave.
   */
  private use(listed: readonly ResearchTask[], readAt: number | undefined): void {
    const tasks = eventTasksFirst(listed);
    this.current = tasks;
    this.keyed = new Map(tasks.map((task) => [task.key, task]));
    this.read = readAt;
    // Its pictures made square in the background (plan 8M-9B, B1), behind those a post or a DM
    // waits for (branch review W5); `prepare` never rejects.
    void this.options.pictures?.prepare(taskPictureSources(tasks), { background: true });
  }

  /** Reads the page now. Never rejects; calls made while one runs share its result. */
  refresh(): Promise<ResearchRefresh> {
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
   * Reads the page when the list in use is older than `refreshMs` (or there is none), else when
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
   * failed, the page is read now instead of at the retry, through `refresh`'s guard (a read the
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

  private async refreshOnce(): Promise<ResearchRefresh> {
    const { log, store, gameData } = this.options;
    let result: ResearchRefresh;
    try {
      const page = await this.download();
      const parsed = parseResearchPage(page, gameData.catalogue, this.options.zone);
      // Whatever becomes of this read: the tasks of a section not read are missing from it.
      if (parsed.unreadSections > 0) {
        log.warn(
          { sections: parsed.unreadSections },
          'sections of the research page could not be read',
        );
      }
      if (parsed.unreadEnds > 0) {
        log.warn(
          { ends: parsed.unreadEnds },
          'ends of events on the research page could not be read',
        );
      }
      const before = this.current.length;
      const shrunk = parsed.tasks
        .map((task) => task.key)
        .sort()
        .join(' ');
      if (parsed.tasks.length * 2 < before && !this.shrinkAgreed(shrunk)) {
        this.shrink = shrunk;
        log.warn(
          { read: parsed.tasks.length, kept: before },
          'the research page lists fewer than half the tasks it did; the list is kept',
        );
        result = { status: 'kept', tasks: before, read: parsed.tasks.length };
      } else {
        const at = this.now();
        await store.replace(parsed.tasks, at);
        this.use(parsed.tasks, at);
        this.shrink = undefined;
        this.staleTold = false;
        if (parsed.unknown.length > 0) {
          log.info({ rewards: parsed.unknown }, 'research rewards the game data does not know');
        }
        if (parsed.skipped > 0) {
          log.warn({ skipped: parsed.skipped }, 'parts of the research page could not be read');
        }
        log.info({ tasks: parsed.tasks.length }, 'research tasks read');
        // The headings read as an event's (review 8R8-3): a standing heading Leek Duck renames or
        // adds would lead every pick list as an event's, so it shows here the first time.
        const eventCategories = [
          ...new Set(parsed.tasks.map((task) => task.category).filter(isEventCategory)),
        ];
        if (eventCategories.length > 0) {
          // The ends as read (a local time, one sample so far): what a wrong one is told by.
          const eventEnds = [
            ...new Set(
              parsed.tasks.flatMap((task) =>
                task.endsAt === undefined ? [] : [new Date(task.endsAt).toISOString()],
              ),
            ),
          ];
          log.info({ eventCategories, eventEnds }, 'research tasks of an event read');
        }
        result = { status: 'updated', tasks: parsed.tasks.length };
      }
    } catch (err) {
      if (err instanceof RefreshStopped) return { status: 'failed', reason: 'stopped' };
      log.warn({ err }, 'could not read the research page');
      result = { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
    }
    this.tellIfStale();
    return result;
  }

  /**
   * Whether a much smaller list is taken after all (review A3): the read before it listed the
   * very same tasks (the page did shrink, it is no broken read), or the list in use is out of
   * date anyway (older than `staleAfterMs`): a real shrink is never refused for good.
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
      'the research task list is out of date',
    );
  }

  private async download(): Promise<string> {
    const { url } = this.options;
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await fetchOnItsHost(this.options.fetch, url, {
        signal: AbortSignal.any([timeout, controller.signal]),
        headers: { Accept: 'text/html', 'User-Agent': PINE_USER_AGENT },
        redirect: 'manual',
      });
      if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
      const body = await readLimitedText(response, MAX_RESEARCH_PAGE_BYTES);
      if (!body.ok) throw new Error(`${url}: the page is ${body.reason}`);
      return body.text;
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
