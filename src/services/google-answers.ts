import { metresBetween } from '@pine/wayspot-core/distance';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { answerCell, answerPoint } from '../domain/geo/answer-point.js';
import { WAYSPOT_MOVED_METRES } from '../domain/geo/spot-address.js';
import type { Logger } from '../log.js';

/**
 * Google's answers about places (plan 19B-3), kept by the point and the kind of question, never
 * by a gym's or a Wayspot's id: two servers with one place ask Google once, and neither changes
 * the other's answer; a gym, a PokéStop and a Power Spot at one place share it. The one source of
 * every address and every list of places around a point that Pine shows or searches: a gym's
 * (`GymDirectory` puts them on its gyms), a Power Spot's address (`WayspotAddresses`) and the
 * places around a PokéStop or Power Spot (`WayspotPlaces`). It holds Google's answers alone:
 * only `GymUpkeep` (its line, a lookup by hand, `/gym refresh`, and what a gym an import moved a
 * few meters keeps, `carry`), `WayspotAddresses` and the Wayspots' load (`carry` of a Wayspot an
 * import moved a few meters) write them; Wayfarer's address is the gym's own, never here.
 *
 * A point's answer is shown by every place within `WAYSPOT_MOVED_METRES` of it (the nearest, when
 * several: `at`); whether a place was asked is its own point's answer alone (`ownAt`): a gym or
 * Wayspot that moved farther, or that stands a few meters from one asked, is asked about itself,
 * and one that an import moved a few meters keeps what its own point had. Every answer is read
 * into memory at start (as the gyms and Wayspots are) so that every reader stays synchronous, and
 * written through on each save. The table is bounded by the places of the instance's gyms and
 * Wayspots: what none of them shows any more is dropped once a day (`sweep`).
 */

/**
 * How near an answer is to a place's own point to be its own (`GoogleAnswers.ownAt`): a meter,
 * well above the rounding of the key (0.1 m) and below any two places Pine tells apart.
 */
export const OWN_ANSWER_METRES = 1;

/** What was asked of a point: its address (`geodataJson`), or the places around it (`placesText`). */
export type AnswerKind = 'address' | 'places';

/** One kept answer: its question, its point (rounded, `answerPoint`), what came, and when. */
export interface GoogleAnswer extends LatLon {
  kind: AnswerKind;
  /** The address parts as JSON, or the places' names joined by spaces; null when none were found. */
  answer: string | null;
  /** When it was asked (epoch ms). */
  askedAt: number;
}

export interface GoogleAnswerStorage {
  /** Every kept answer, in no particular order. */
  all(): Promise<GoogleAnswer[]>;
  /** Keeps answers, each over the one kept for its kind and point. */
  save(answers: readonly GoogleAnswer[]): Promise<void>;
  /**
   * Deletes answers by their kind and point (the key), each only while it is still the one kept
   * there (its `askedAt`): one saved over it meanwhile stays.
   */
  remove(answers: readonly GoogleAnswer[]): Promise<void>;
}

/** Places that show an answer, as one sweep looks them up (`PlaceKeeper.keptPlaces`). */
export interface KeptPlaces {
  /**
   * Whether one lies within `WAYSPOT_MOVED_METRES` of the point (an answer it shows),
   * whichever server's: looked up in the cells around the point (`answerCell`), never by
   * measuring every place.
   */
  anyNear(point: LatLon): boolean;
}

/**
 * Where places are kept that show an answer (`GoogleAnswers.sweep`): every server's gyms
 * (`GymDirectory`), every server's Wayspots and stops of Pine's own (`WayspotDirectory`).
 */
export interface PlaceKeeper {
  /**
   * The places as a sweep looks them up, asked by a sweep that sweeps and dropped after it: an
   * index built for it alone where the keeper holds none (the Wayspots'), never kept between
   * sweeps.
   */
  keptPlaces(): KeptPlaces;
}

/** How often the answers no place uses are dropped (`GoogleAnswers.sweep`): once a day. */
export const SWEEP_EVERY_MS = 24 * 3_600_000;

/**
 * How many answers a sweep looks up before it lets other work run (`setImmediate`): an
 * instance's tens of thousands of answers never hold the event loop at once.
 */
export const SWEEP_ANSWERS_A_TURN = 2_000;

const nextTurn = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

function keyOf(answer: { kind: AnswerKind; lat: number; lon: number }): string {
  return `${answer.kind}:${String(answer.lat)}:${String(answer.lon)}`;
}

function cellKey(kind: AnswerKind, lat: number, lon: number): string {
  return `${kind}:${String(lat)}:${String(lon)}`;
}

/** The kept answers in memory: the database's twin. `failing` makes `save` reject. */
export class MemoryGoogleAnswerStorage implements GoogleAnswerStorage {
  readonly rows = new Map<string, GoogleAnswer>();
  failing = false;

  all(): Promise<GoogleAnswer[]> {
    return Promise.resolve([...this.rows.values()].map((row) => ({ ...row })));
  }

  save(answers: readonly GoogleAnswer[]): Promise<void> {
    if (this.failing) return Promise.reject(new Error('the answers cannot be written'));
    for (const answer of answers) this.rows.set(keyOf(answer), { ...answer });
    return Promise.resolve();
  }

  remove(answers: readonly GoogleAnswer[]): Promise<void> {
    if (this.failing) return Promise.reject(new Error('the answers cannot be written'));
    for (const answer of answers) {
      if (this.rows.get(keyOf(answer))?.askedAt === answer.askedAt) {
        this.rows.delete(keyOf(answer));
      }
    }
    return Promise.resolve();
  }
}

export interface GoogleAnswersOptions {
  /** Where they are kept (`GoogleAnswerRepository` in the bot). */
  storage: GoogleAnswerStorage;
  log: Logger;
  /** Default `Date.now`: when the answers no place uses were last dropped (`sweep`). */
  now?: () => number;
}

export class GoogleAnswers {
  /** By kind and rounded point. */
  private readonly rows = new Map<string, GoogleAnswer>();
  /** By kind and cell (`answerCell`): what lies near a point. */
  private readonly cells = new Map<string, GoogleAnswer[]>();
  private readonly listeners: ((saved: readonly GoogleAnswer[]) => void)[] = [];
  /** When the last sweep dropped what no place uses (epoch ms); none yet. */
  private sweptAt: number | undefined;

  constructor(private readonly options: GoogleAnswersOptions) {}

  /** Reads every kept answer (at start, before the gyms and the Wayspots). */
  async load(): Promise<void> {
    const rows = await this.options.storage.all();
    this.rows.clear();
    this.cells.clear();
    for (const row of rows) this.put(row);
  }

  /** How many answers are kept. */
  get size(): number {
    return this.rows.size;
  }

  /**
   * The answer to show for a point meanwhile: the nearest kept within `WAYSPOT_MOVED_METRES`, the
   * newer of two as near; undefined when none is (never asked here, or the place moved farther).
   * An answer whose `answer` is null says Google found nothing. Whether a place was asked about is
   * `ownAt`'s.
   */
  at(kind: AnswerKind, point: LatLon): GoogleAnswer | undefined {
    return this.nearest(kind, point, WAYSPOT_MOVED_METRES);
  }

  /**
   * The answer of a place's own point (within `OWN_ANSWER_METRES`: its key, rounded): what decides
   * whether a gym or Wayspot was asked about and waits in the line or not. A neighbor's answer a
   * few meters off is shown meanwhile (`at`), but never keeps a place from being asked.
   */
  ownAt(kind: AnswerKind, point: LatLon): GoogleAnswer | undefined {
    return this.nearest(kind, point, OWN_ANSWER_METRES);
  }

  /**
   * After places moved a few meters without a new question (a Wayfarer import's small moves):
   * what was answered about each one's old point (`ownAt`: its own answer, never a neighbor's
   * shown meanwhile, which would keep a place never asked from being asked) is kept at its new
   * one, with when it was asked, unless the new point has an answer of its own. Rejects, keeping
   * nothing, when the write fails.
   */
  async carry(moves: readonly { from: LatLon; to: LatLon }[]): Promise<void> {
    const copies: GoogleAnswer[] = [];
    for (const { from, to } of moves) {
      for (const kind of ['address', 'places'] as const) {
        const before = this.ownAt(kind, from);
        if (before === undefined || this.ownAt(kind, to) !== undefined) continue;
        copies.push({ ...before, lat: to.lat, lon: to.lon });
      }
    }
    await this.save(copies);
  }

  private nearest(kind: AnswerKind, point: LatLon, within: number): GoogleAnswer | undefined {
    const cell = answerCell(point);
    let best: { answer: GoogleAnswer; metres: number } | undefined;
    for (let lat = cell.lat - 1; lat <= cell.lat + 1; lat++) {
      for (let lon = cell.lon - 1; lon <= cell.lon + 1; lon++) {
        for (const answer of this.cells.get(cellKey(kind, lat, lon)) ?? []) {
          const metres = metresBetween(answer, point);
          if (metres > within) continue;
          if (
            !best ||
            metres < best.metres ||
            (metres === best.metres && answer.askedAt > best.answer.askedAt)
          ) {
            best = { answer, metres };
          }
        }
      }
    }
    return best && { ...best.answer };
  }

  /**
   * Keeps answers at their rounded points, each over what was kept for its kind and point there
   * (for every server: it is Google's answer about the place): written first, then in memory,
   * then told (`whenSaved`). Rejects, keeping and telling nothing, when the write fails.
   */
  async save(answers: readonly GoogleAnswer[]): Promise<void> {
    if (answers.length === 0) return;
    const rounded = answers.map((answer) => ({ ...answer, ...answerPoint(answer) }));
    await this.options.storage.save(rounded);
    for (const answer of rounded) this.put(answer);
    for (const listener of this.listeners) {
      try {
        listener(rounded);
      } catch (err) {
        this.options.log.warn({ err }, 'could not tell of new answers from Google');
      }
    }
  }

  /** Told of every save, with what was saved (rounded), after it is in memory. */
  whenSaved(listener: (saved: readonly GoogleAnswer[]) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Drops the answers that no gym or Wayspot of any server shows (none of the `keepers`' places lies within
   * `WAYSPOT_MOVED_METRES` of the answer's point: the gym moved farther or was deleted, the
   * Wayspot was found gone, the server that kept it went), so that the table stays as large as
   * the places of the instance's gyms and Wayspots, never every place they ever were. At most
   * once a day (`SWEEP_EVERY_MS`; the scheduler's upkeep asks hourly, the first time at start),
   * once the gyms and Wayspots are loaded. Deleted by the table's key, each only while it is
   * still the answer swept (an answer saved anew at its point meanwhile stays, in the table and
   * in memory). One swept by mistake (a place put there in the very moment) costs one question
   * again. The places are looked up as `keepers` give them for this sweep alone
   * (`PlaceKeeper.keptPlaces`), let go when it ends, and other work runs every
   * `SWEEP_ANSWERS_A_TURN` answers. Gives how many were dropped; never rejects: what cannot be
   * written is logged and swept again at the next ask.
   */
  async sweep(keepers: readonly PlaceKeeper[]): Promise<number> {
    const now = (this.options.now ?? Date.now)();
    if (this.sweptAt !== undefined && now - this.sweptAt < SWEEP_EVERY_MS) return 0;
    const places = keepers.map((keeper) => keeper.keptPlaces());
    const unused: GoogleAnswer[] = [];
    let looked = 0;
    for (const answer of [...this.rows.values()]) {
      if (!places.some((kept) => kept.anyNear(answer))) unused.push(answer);
      looked += 1;
      if (looked % SWEEP_ANSWERS_A_TURN === 0) await nextTurn();
    }
    try {
      await this.options.storage.remove(unused);
    } catch (err) {
      this.options.log.warn({ err }, 'could not drop the answers of Google no place uses');
      return 0;
    }
    this.sweptAt = now;
    let dropped = 0;
    for (const answer of unused) if (this.drop(answer)) dropped += 1;
    if (dropped > 0) {
      this.options.log.info({ answers: dropped }, 'dropped answers of Google no place uses');
    }
    return dropped;
  }

  /** Takes an answer out of memory, unless another was put at its key meanwhile. */
  private drop(answer: GoogleAnswer): boolean {
    const key = keyOf(answer);
    if (this.rows.get(key) !== answer) return false;
    this.rows.delete(key);
    const cell = answerCell(answer);
    const ckey = cellKey(answer.kind, cell.lat, cell.lon);
    const inCell = (this.cells.get(ckey) ?? []).filter((one) => one !== answer);
    if (inCell.length === 0) this.cells.delete(ckey);
    else this.cells.set(ckey, inCell);
    return true;
  }

  private put(answer: GoogleAnswer): void {
    const key = keyOf(answer);
    const before = this.rows.get(key);
    const cell = answerCell(answer);
    const ckey = cellKey(answer.kind, cell.lat, cell.lon);
    const inCell = (this.cells.get(ckey) ?? []).filter((one) => one !== before);
    const kept = { ...answer };
    inCell.push(kept);
    this.cells.set(ckey, inCell);
    this.rows.set(key, kept);
  }
}
