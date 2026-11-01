import { BoundedMap } from '../bounded-map.js';
import {
  maxTeamPath,
  readMaxTeam,
  type MaxTeamAnswer,
  type MaxTeamQuery,
} from '../domain/counters/max-team.js';
import { keptAnswer } from '../domain/counters/counters.js';
import { counterPath, POKEBATTLER_API, type CounterQuery } from '../domain/counters/options.js';
import {
  hasCounters,
  readCounterAnswer,
  type CounterAnswer,
} from '../domain/counters/pokebattler-answer.js';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';
import { discardBody, readLimitedJson, type LimitedResponse } from './limited-json.js';

/** A simulation to ask for, with the names the boss may have, tried in this order. */
export interface CounterRequest extends Omit<CounterQuery, 'boss'> {
  bosses: readonly string[];
}

/** A max battle team to ask for (plan 8X-6), with the names the boss may have, in this order. */
export interface MaxTeamRequest extends Omit<MaxTeamQuery, 'boss'> {
  bosses: readonly string[];
}

/**
 * Why Pokebattler gave nothing. `unknown`: Pokebattler knows none of the boss's names (or the
 * Pokébox, also one it will not show: 401 and 403 for a Pokébox). `empty`: it answered, but
 * with no counter (no team) at all under any name (an empty Pokébox, or nothing that can fight).
 * `refused`: another error status (`status`). `timeout`, `unreachable`: no answer. `too-large`,
 * `unreadable`: an answer that could not be read. `busy`: too many requests wait for their
 * turn already. `unavailable`: Pokebattler gave no answer (a timeout, unreachable) less than
 * `pauseMs` ago, and is not asked until then.
 */
export interface PokebattlerFailure {
  ok: false;
  reason:
    | 'unknown'
    | 'empty'
    | 'refused'
    | 'timeout'
    | 'unreachable'
    | 'too-large'
    | 'unreadable'
    | 'busy'
    | 'unavailable';
  status?: number;
}

/** What came of asking for counters: the answer, with the query that gave it, or a failure. */
export type CounterOutcome =
  { ok: true; answer: CounterAnswer; query: CounterQuery } | PokebattlerFailure;

/** What came of asking for a max battle team: the team, with the query that gave it, or a failure. */
export type MaxTeamOutcome =
  { ok: true; answer: MaxTeamAnswer; query: MaxTeamQuery } | PokebattlerFailure;

/**
 * Raid simulations and max battle teams of Pokebattler, for `/counters`. Nothing here throws: a
 * failure is an answer. Tests use `FakePokebattler` (`test/support/pokebattler.ts`); nothing in
 * a test touches the network.
 */
export interface PokebattlerGateway {
  counters(request: CounterRequest): Promise<CounterOutcome>;
  /** The suggested team of three for a max battle in a role (plan 8X-6). */
  maxTeam(request: MaxTeamRequest): Promise<MaxTeamOutcome>;
}

export type PokebattlerFetch = (
  url: string,
  init: {
    method: 'GET';
    headers: Record<string, string>;
    redirect: 'error';
    signal: AbortSignal;
  },
) => Promise<LimitedResponse>;

export interface PokebattlerFightOptions {
  fetch: PokebattlerFetch;
  log: Logger;
  now?: () => number;
  /**
   * How long one request may take, its body included. Default 30 seconds: a query Pokebattler
   * has not worked out lately took it longer than ten (staging of 8X-F, 2026-10-22), and the
   * answer is deferred (Discord allows 15 minutes).
   */
  timeoutMs?: number;
  /**
   * A longer raid answer is given up. Default 32 MB: Mew's in a T5 raid is 14.7 MB (100 boss
   * movesets; 2026-10-22), twice that leaves room. Only what can be shown is kept of it.
   */
  maxBytes?: number;
  /** A longer max battle team is given up. Default 5 MB (a real one is a few kilobytes). */
  maxTeamBytes?: number;
  /**
   * How long an answer is kept for the same request, unless its `Cache-Control` says less.
   * Default six hours: Pokebattler's simulations change only when it runs them again for new
   * game data, and its API page asks for answers to be kept.
   */
  cacheMs?: number;
  /** How many answers are kept at most, of each kind. Default 200. */
  cacheSize?: number;
  /** How many requests may be on their way at once; the others wait. Default three. */
  maxConcurrent?: number;
  /** How many requests may wait for their turn; one more is `busy`. Default ten. */
  maxWaiting?: number;
  /**
   * How long Pokebattler is not asked after it could not be reached. Default a minute. A
   * timeout does not pause it: Pokebattler is working the query out, not down.
   */
  pauseMs?: number;
}

/** Pine's User-Agent, with a contact, as Pokebattler's developer page asks. */
export const POKEBATTLER_USER_AGENT = 'Professor-Pine (+https://github.com/Googer/Professor-Pine)';

/**
 * What an answer's headers say of keeping it (review r0 A1; Pokebattler sends
 * `cache-control: max-age=3600` and a weak ETag, probed on 2026-10-22): `store` false for
 * `no-store`; `freshMs` how long it may be used without asking again (`max-age`, none for
 * `no-cache`; undefined: as long as the gateway keeps answers); `etag` what to ask again with.
 */
export interface KeepRule {
  store: boolean;
  freshMs: number | undefined;
  etag: string | undefined;
}

/** The `KeepRule` of an answer by its `Cache-Control` and `ETag` headers. */
export function keepRule(headers: { get(name: string): string | null }): KeepRule {
  const etag = headers.get('etag') ?? undefined;
  const directives = (headers.get('cache-control') ?? '')
    .toLowerCase()
    .split(',')
    .map((part) => part.trim());
  if (directives.includes('no-store')) return { store: false, freshMs: undefined, etag };
  if (directives.includes('no-cache')) return { store: true, freshMs: 0, etag };
  for (const part of directives) {
    const match = /^max-age=(\d+)$/.exec(part);
    if (match?.[1] !== undefined) return { store: true, freshMs: Number(match[1]) * 1000, etag };
  }
  return { store: true, freshMs: undefined, etag };
}

/**
 * How long a kept answer is used as it is after asking again with its ETag found no answer (a
 * timeout, Pokebattler away), before it is asked again (review r1, R1-2).
 */
const REVALIDATION_PAUSE_MS = 60_000;

/** A rule that keeps nothing: what a failure comes with. */
const KEEP_NOTHING: KeepRule = { store: false, freshMs: undefined, etag: undefined };

/** Statuses by which Pokebattler says it knows no such boss, level or Pokébox. */
const NOT_KNOWN = new Set([400, 404]);
/**
 * Statuses by which it answers for a Pokébox it will not show (the user id of somebody else, or
 * a Pokébox that is not shared): for a Pokébox they are `unknown` too.
 */
const BOX_NOT_SHOWN = new Set([401, 403]);

type Outcome = { ok: true } | PokebattlerFailure;

/** A good answer of each kind: what is kept. */
type GoodCounters = Extract<CounterOutcome, { ok: true }>;
type GoodTeam = Extract<MaxTeamOutcome, { ok: true }>;

/**
 * What came of one request: the outcome and what its headers say of keeping it, or, for a
 * request asked again with the kept answer's ETag, that nothing changed (304).
 */
type Asked<T> =
  { outcome: T | PokebattlerFailure; keep: KeepRule } | { notModified: true; keep: KeepRule };

/**
 * A kept answer: when it was got or last confirmed (`at`; kept `cacheMs` from then), until when
 * it is used without asking again (`fresh`), and the ETag to ask again with.
 */
interface Kept<T> {
  at: number;
  fresh: number;
  /** How long it is fresh each time (its `max-age`): what a 304 without one renews it for. */
  freshFor: number;
  etag: string | undefined;
  outcome: T;
}

/** The answers of one kind of request kept, and those being asked. */
interface Shared<T> {
  cache: BoundedMap<string, Kept<T>>;
  asking: Map<string, Promise<T | PokebattlerFailure>>;
}

/** One request to send: its address, what the log says of it, and how its body is read. */
interface OneRequest<T> {
  path: string;
  what: Record<string, unknown>;
  /** Whether 401 and 403 mean an unknown Pokébox. */
  box: boolean;
  /** A longer body is given up (`too-large`). */
  maxBytes: number;
  /** The ETag of the answer kept, to ask whether it changed (`If-None-Match`). */
  etag?: string | undefined;
  /** The outcome of a body read; `empty` for an answer with nothing in it. */
  read: (body: unknown) => T | PokebattlerFailure;
}

/**
 * Pokebattler's API over `fetch`: raid simulations as the legacy bot asked them, and max battle
 * teams (plan 8X-6), both through the same turns, pause, cache and limits. One request per
 * setting at a time: whoever asks for what is being asked already waits for that answer, and an
 * answer is kept for six hours from when it was got or last confirmed (a failure never), so the
 * members of one raid who ask in turn make one request; past its `Cache-Control`'s `max-age` it is
 * asked for again with its ETag (`If-None-Match`), and a 304 renews it without a download (review
 * r0 A1); `no-cache` keeps it but asks each time, `no-store` keeps nothing. Of a raid answer only what can be shown
 * is kept (`keptAnswer`), right after it is read. A boss Pokebattler does not know under its
 * first name is asked under the next. At most `maxWaiting` wait for their turn (one more is
 * `busy`), and after a request that could not reach Pokebattler nothing is sent for `pauseMs`
 * (`unavailable`, at once, also for what was waiting), whatever it asks for; a timeout does not
 * pause it (plan 8X-G).
 */
export class PokebattlerFight implements PokebattlerGateway {
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxTeamBytes: number;
  private readonly cacheMs: number;
  private readonly counterAnswers: Shared<GoodCounters>;
  private readonly maxAnswers: Shared<GoodTeam>;
  private readonly maxConcurrent: number;
  private running = 0;
  private readonly turns: (() => void)[] = [];
  private readonly maxWaiting: number;
  private readonly pauseMs: number;
  private pausedUntil = 0;
  /** Whether the log said once that Pokebattler asks for its answers not to be kept. */
  private noStoreSaid = false;

  constructor(private readonly options: PokebattlerFightOptions) {
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
    this.maxTeamBytes = options.maxTeamBytes ?? 5 * 1024 * 1024;
    this.cacheMs = options.cacheMs ?? 6 * 3_600_000;
    const cacheSize = options.cacheSize ?? 200;
    this.counterAnswers = { cache: new BoundedMap(cacheSize), asking: new Map() };
    this.maxAnswers = { cache: new BoundedMap(cacheSize), asking: new Map() };
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 3);
    this.maxWaiting = options.maxWaiting ?? 10;
    this.pauseMs = options.pauseMs ?? 60_000;
  }

  counters(request: CounterRequest): Promise<CounterOutcome> {
    if (request.bosses.length === 0) return Promise.resolve({ ok: false, reason: 'unknown' });
    const key = JSON.stringify([
      request.bosses,
      request.raidLevel,
      request.attackers,
      request.weather,
      request.friendship,
      request.shadow,
      request.mega,
    ]);
    const { bosses, ...rest } = request;
    return this.shared(
      this.counterAnswers,
      key,
      () =>
        this.byNames(bosses, { raidLevel: request.raidLevel }, 'counters', (boss) =>
          this.counterRequest({ ...rest, boss }),
        ),
      // A Pokébox is its owner's to change at any time: its answer is not kept.
      request.attackers.kind === 'level',
      (kept, etag) => this.inTurn(() => this.counterRequest(kept.query, etag)),
    );
  }

  maxTeam(request: MaxTeamRequest): Promise<MaxTeamOutcome> {
    if (request.bosses.length === 0) return Promise.resolve({ ok: false, reason: 'unknown' });
    const key = JSON.stringify([
      request.bosses,
      request.maxLevel,
      request.role,
      request.level,
      request.weather,
      request.friendship,
    ]);
    const { bosses, ...rest } = request;
    return this.shared(
      this.maxAnswers,
      key,
      () =>
        this.byNames(bosses, { maxLevel: request.maxLevel }, 'max battle team', (boss) =>
          this.maxRequest({ ...rest, boss }),
        ),
      true,
      (kept, etag) => this.inTurn(() => this.maxRequest(kept.query, etag)),
    );
  }

  /**
   * An answer kept or being asked for the same key, else a new one (`ask`), unless Pokebattler
   * is paused or too many wait. A good answer is kept when `keep`, as its headers allow
   * (`KeepRule`), for `cacheMs` from when it was got or last confirmed; a kept one past its
   * freshness is asked for again with its ETag (`revalidate`): a 304 renews it, a new answer
   * replaces it, a name Pokebattler no longer knows asks under every name again, and no answer
   * at all (a timeout, Pokebattler away) answers with the kept one, fresh a minute more.
   */
  private shared<T extends { ok: true }>(
    answers: Shared<T>,
    key: string,
    ask: () => Promise<Asked<T>>,
    keep: boolean,
    revalidate: (kept: T, etag: string) => Promise<Asked<T>>,
  ): Promise<T | PokebattlerFailure> {
    const now = this.now();
    answers.cache.dropWhile((kept) => now - kept.at >= this.cacheMs);
    const kept = answers.cache.get(key);
    if (kept && now < kept.fresh) return Promise.resolve(kept.outcome);
    if (kept && kept.etag === undefined) answers.cache.delete(key);
    const asking = answers.asking.get(key);
    if (asking) return asking;
    const stale = kept?.etag === undefined ? undefined : kept;
    if (now < this.pausedUntil) {
      return Promise.resolve(stale?.outcome ?? { ok: false, reason: 'unavailable' });
    }
    if (this.turns.length >= this.maxWaiting) {
      return Promise.resolve(stale?.outcome ?? { ok: false, reason: 'busy' });
    }
    const freshFor = (rule: KeepRule, before?: number) =>
      Math.min(this.cacheMs, rule.freshMs ?? before ?? this.cacheMs);
    /** What a request without an ETag came to, kept as its rule says. */
    const got = (done: Asked<T>): T | PokebattlerFailure => {
      if ('notModified' in done) return { ok: false, reason: 'unreadable' };
      const at = this.now();
      const { outcome, keep: rule } = done;
      if (!outcome.ok) {
        answers.cache.delete(key);
        return outcome;
      }
      if (!rule.store) {
        answers.cache.delete(key);
        if (!this.noStoreSaid) {
          this.noStoreSaid = true;
          this.options.log.warn('Pokebattler asks for its answers not to be kept');
        }
      } else if (keep) {
        const kept = freshFor(rule);
        answers.cache.set(key, {
          at,
          fresh: at + kept,
          freshFor: kept,
          etag: rule.etag,
          outcome,
        });
      }
      return outcome;
    };
    /** What asking again with the kept answer's ETag came to. */
    const revalidated = async (kept: Kept<T>, etag: string): Promise<T | PokebattlerFailure> => {
      const done = await revalidate(kept.outcome, etag);
      if ('notModified' in done) {
        const at = this.now();
        const renewed = freshFor(done.keep, kept.freshFor);
        answers.cache.set(key, { ...kept, at, fresh: at + renewed, freshFor: renewed });
        return kept.outcome;
      }
      if (done.outcome.ok) return got(done);
      // A name Pokebattler no longer knows: every name is asked again (review r1, R1-3).
      if (done.outcome.reason === 'unknown' || done.outcome.reason === 'empty') {
        return got(await ask());
      }
      // No answer came: the kept answer stands, fresh a minute more, so that the next requests
      // do not wait the full time out again (review r1, R1-2); when it was got stays as it was.
      kept.fresh = this.now() + REVALIDATION_PAUSE_MS;
      return kept.outcome;
    };
    const answer = (
      stale?.etag === undefined ? ask().then(got) : revalidated(stale, stale.etag)
    ).finally(() => answers.asking.delete(key));
    answers.asking.set(key, answer);
    return answer;
  }

  /**
   * Asks under each name of the boss in turn until one is known and has something; `noun` is what
   * the log says it had none of.
   */
  private async byNames<T extends Outcome>(
    bosses: readonly string[],
    level: Record<string, string>,
    noun: 'counters' | 'max battle team',
    one: (boss: string) => Promise<Asked<T>>,
  ): Promise<Asked<T>> {
    let empty = false;
    for (const boss of bosses) {
      const asked = await this.inTurn(() => one(boss));
      // Not asked with an ETag here: no 304 can come.
      if ('notModified' in asked) return asked;
      const { outcome } = asked;
      if (outcome.ok) return asked;
      if (outcome.reason !== 'unknown' && outcome.reason !== 'empty') return asked;
      empty ||= outcome.reason === 'empty';
      this.options.log.info(
        { boss, ...level, reason: outcome.reason },
        `Pokebattler has no ${noun} for this boss by this name`,
      );
    }
    return { outcome: { ok: false, reason: empty ? 'empty' : 'unknown' }, keep: KEEP_NOTHING };
  }

  /**
   * Runs a request once fewer than `maxConcurrent` are on their way; not at all when a pause
   * began while it waited.
   */
  private async inTurn<T>(request: () => Promise<Asked<T>>): Promise<Asked<T>> {
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.turns.push(resolve));
    } else {
      this.running += 1;
    }
    try {
      if (this.now() < this.pausedUntil) {
        return { outcome: { ok: false, reason: 'unavailable' }, keep: KEEP_NOTHING };
      }
      return await request();
    } finally {
      const next = this.turns.shift();
      // The place is handed on to the next in line, or given up.
      if (next) next();
      else this.running -= 1;
    }
  }

  private counterRequest(query: CounterQuery, etag?: string): Promise<Asked<GoodCounters>> {
    return this.one({
      path: counterPath(query),
      what: { boss: query.boss, raidLevel: query.raidLevel, box: query.attackers.kind === 'box' },
      box: query.attackers.kind === 'box',
      maxBytes: this.maxBytes,
      etag,
      read: (body): CounterOutcome => {
        const read = readCounterAnswer(body);
        if (!read) return { ok: false, reason: 'unreadable' };
        // Only what can be shown is kept: Mew's whole answer is 14.7 MB of JSON.
        const answer = keptAnswer(read, query);
        if (!hasCounters(answer)) return { ok: false, reason: 'empty' };
        return { ok: true, answer, query };
      },
    });
  }

  private maxRequest(query: MaxTeamQuery, etag?: string): Promise<Asked<GoodTeam>> {
    return this.one({
      path: maxTeamPath(query),
      what: { boss: query.boss, maxLevel: query.maxLevel, role: query.role },
      box: false,
      maxBytes: this.maxTeamBytes,
      etag,
      read: (body): MaxTeamOutcome => {
        const answer = readMaxTeam(body);
        if (!answer) return { ok: false, reason: 'unreadable' };
        if (answer.slots.length === 0) return { ok: false, reason: 'empty' };
        if (answer.dropped) {
          // Once per answer read: a kept answer is not read again.
          this.options.log.warn(
            { boss: query.boss, maxLevel: query.maxLevel, ...answer.dropped },
            'Pokebattler’s max battle team had parts not of the shape known',
          );
        }
        return { ok: true, answer, query };
      },
    });
  }

  private async one<T extends Outcome>(request: OneRequest<T>): Promise<Asked<T>> {
    const { log } = this.options;
    const { what } = request;
    const failed = (failure: PokebattlerFailure): Asked<T> => ({
      outcome: failure,
      keep: KEEP_NOTHING,
    });
    try {
      const response = await this.options.fetch(`${POKEBATTLER_API}${request.path}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': POKEBATTLER_USER_AGENT,
          ...(request.etag === undefined ? {} : { 'If-None-Match': request.etag }),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      // For the staging: whether an answer was downloaded, or a 304 renewed the one kept.
      log.debug(
        response.status === 304
          ? { ...what, status: response.status, etag: request.etag }
          : { ...what, status: response.status },
        'Pokebattler answered',
      );
      if (response.status === 304 && request.etag !== undefined) {
        // Nothing changed since the answer kept: no body to read.
        discardBody(response);
        return { notModified: true, keep: keepRule(response.headers) };
      }
      if (NOT_KNOWN.has(response.status) || (request.box && BOX_NOT_SHOWN.has(response.status))) {
        discardBody(response);
        return failed({ ok: false, reason: 'unknown', status: response.status });
      }
      if (response.status !== 200) {
        discardBody(response);
        log.warn({ ...what, status: response.status }, 'Pokebattler refused a request');
        return failed({ ok: false, reason: 'refused', status: response.status });
      }
      const body = await readLimitedJson(response, request.maxBytes);
      if (!body.ok) {
        log.warn({ ...what, reason: body.reason }, 'could not read the answer of Pokebattler');
        return failed({ ok: false, reason: body.reason });
      }
      const outcome = request.read(body.value);
      if (!outcome.ok && outcome.reason === 'unreadable') {
        log.warn(what, 'the answer of Pokebattler is not of the shape known');
      }
      return { outcome, keep: keepRule(response.headers) };
    } catch (err) {
      const timeout = err instanceof Error && err.name === 'TimeoutError';
      // A timeout is a query Pokebattler is still working out: the next may be answered at once.
      if (!timeout) this.pausedUntil = this.now() + this.pauseMs;
      log.warn(
        timeout
          ? { ...what, reason: 'timeout', timeoutMs: this.timeoutMs }
          : { ...what, reason: failureReason(err), pauseMs: this.pauseMs },
        'could not ask Pokebattler',
      );
      return failed({ ok: false, reason: timeout ? 'timeout' : 'unreachable' });
    }
  }
}
