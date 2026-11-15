import { gymStop, hasStop } from '../domain/party/stops.js';
import type { Gym, GymStorage } from '../db/repositories/gym-repository.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import { geodataJson, placesRadius, placesText } from '../domain/geo/google.js';
import { WAYSPOT_MOVED_METRES } from '../domain/geo/spot-address.js';
import {
  nearestAfterGone,
  nearestGymChanges,
  type NearestChange,
  type NearestEvent,
  type Together,
} from '../domain/gyms/nearest.js';
import { isMeetup, isRaid, isTrain, type Party } from '../domain/party/party.js';
import type { Logger } from '../log.js';
import type { GeoFailure, GeoGateway } from './geo-gateway.js';
import {
  googleMonth,
  lineAllowance,
  NO_REGION_RANK,
  OUT_OF_SHARE_RANK,
  type GoogleBudget,
  type GoogleUsed,
} from '../domain/geo/google-line.js';
import {
  DEFAULT_BY_HAND_FLOOR,
  serverFloor,
  withinFloors,
  type MonthShare,
} from '../domain/geo/google-shares.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { GoogleAnswers } from './google-answers.js';
import type { GoogleShares, ServerMonthShare } from './google-shares.js';
import { MemoryGoogleUse, usedThisMonth, type GoogleCount, type GoogleUse } from './google-use.js';
import type { GoogleRanks } from './google-ranks.js';
import {
  MemoryGymLookups,
  type GymLookups,
  type GymRank,
  type OutOfShare,
  type QueuedGym,
  type WaitingGym,
} from './gym-lookups.js';
import type { WayspotProvider } from './wayspot-directory.js';
import {
  MemoryWayspotLookups,
  spotKey,
  type QueuedWayspot,
  type WaitingWayspot,
  type WayspotLookups,
} from './wayspot-lookups.js';
import { WayspotPlaces } from './wayspot-places.js';

/**
 * What came of fetching one thing about a gym: it was written (`updated`), it is what the gym
 * had already (`unchanged`), or why Google gave nothing (the gym then keeps what it had).
 */
export type FetchOutcome = 'updated' | 'unchanged' | ByHandRefused | GeoFailure;

/** Why a lookup by hand asked nothing: past its cap, or a count that could not be read. */
type ByHandRefused = 'capped' | 'count-unread';

/**
 * Whether a question about a gym reached Google: a refused key or none asks nothing, and neither
 * does a lookup by hand that was refused (`ByHandRefused`).
 */
function reachedGoogle(outcome: FetchOutcome | undefined): boolean {
  return (
    outcome !== undefined &&
    outcome !== 'denied' &&
    outcome !== 'no-key' &&
    outcome !== 'capped' &&
    outcome !== 'count-unread'
  );
}

/** The monthly cap of lookups by hand unless the settings say otherwise (plan 8Z). */
export const DEFAULT_BY_HAND_PER_MONTH = 500;

/** More gyms than this that get another nearest gym through one change are noted in the log. */
const MANY_NEAREST = 10;

/**
 * The monthly budget unless the settings say otherwise (plan 8W-6; `googleLookupsPerMonth`,
 * `googleLookupsReserve`, `googleGeocodesPerMonth`): Google's free amounts are 5,000 Places
 * searches (Nearby Search Pro) and 10,000 Geocodings a month, less a margin; the line leaves 500
 * places questions for gyms added and moved by hand and `/gym refresh`.
 */
export const DEFAULT_GOOGLE_BUDGET: GoogleBudget = {
  places: 4_500,
  reserve: 500,
  geocodes: 9_000,
  geocodesReserve: 500,
};

/** What the line needs of the ranks of places (`GoogleRanks`); without it every place ranks 0. */
export type LineRanks = Pick<GoogleRanks, 'refresh' | 'ofGym' | 'ofWayspot'>;

/** The rank of a gym asked again for what did not come: after every other gym, until reranked. */
const RETRY_RANK = NO_REGION_RANK - 1;

/** The longest the line waits after turns whose questions did not answer. */
const MAX_RETRY_WAIT_MS = 3_600_000;

/**
 * The longest timer the line sets: a longer wait (until the month resets) is a turn every six
 * hours that finds nothing to ask and sets the next. Node holds a timer of at most 2^31 - 1 ms
 * (about 24.8 days) and fires a longer one at once, which would ask the database again and again.
 */
export const MAX_TIMER_MS = 6 * 3_600_000;

/** How far around a Wayspot its nearest gym, PokéStop or Power Spot is looked for. */
const NEAREST_PLACE_METRES = 1_000;

const SAME_RANK: LineRanks = {
  refresh: () => Promise.resolve(),
  ofGym: () => 0,
  ofWayspot: () => 0,
};

/** Whether two gyms' servers (sorted or not) have one in common. */
export function sharesServer(a: readonly number[], b: readonly number[]): boolean {
  return a.some((server) => b.includes(server));
}

/** What a writer of the line notes before its write (`GymUpkeep.beforeWrite`). */
interface WriteNote {
  /** The servers of its rows the shares do not know (fix round 3, T1). */
  unknown: Set<number>;
  /**
   * Whether each server's rows were ranked as held, by `<guildId>:<address>` (fix round 4, R3).
   */
  held: Map<string, { guildId: number; address: boolean; held: boolean }>;
}

/** What `refresh` got for a gym, which is given as it is afterwards. */
export interface GymRefresh {
  gym: Gym;
  geodata: FetchOutcome;
  places: FetchOutcome;
}

/** The line as it is (`GymUpkeep.snapshot`, for `/gym google`). */
export interface GoogleLineSnapshot {
  /** Whether Google is asked at all (an API key is configured). */
  fetches: boolean;
  /** Every gym that waits, in the line's order. */
  gyms: WaitingGym[];
  /** Every PokéStop and Power Spot that waits, in the line's order (after every gym). */
  wayspots: WaitingWayspot[];
  used: GoogleUsed;
  budget: GoogleBudget;
  /** The monthly cap of lookups by hand (`GymUpkeepOptions.byHandPerMonth`). */
  byHandPerMonth: number;
  /** One question every so often. */
  everyMs: number;
  now: number;
  /** The server asked about (plan 19B-5), where one was. */
  server?: {
    /** Its share of the month and what the line used of it; none without shares or a need. */
    share: ServerMonthShare | undefined;
    /**
     * What the line asked of its rows this month, of each kind, as counted (also where it has no
     * share: nothing of it waits now; fix round 4, R6).
     */
    used: MonthShare;
    /**
     * The ranks its rows have by its regions (`LineRanks`), held or not: where they stand on the
     * 1st, when no server is out of its share (fix round 4, R6: the next month's estimate).
     */
    ownRanks: { gyms: Map<number, number>; wayspots: Map<string, number> };
    /** Its lookups by hand this month. */
    byHand: number;
    /** Its floor of them (`googleByHandPerServer`, scaled down by the servers Pine is in). */
    byHandFloor: number;
  };
}

/** The part of `GymDirectory` the upkeep works on. */
export interface GymsInMemory {
  all(): Gym[];
  /** A gym by its id, whichever server's (`GymDirectory.stored`): the upkeep is the instance's. */
  stored(id: number): Gym | undefined;
  /** The servers a gym belongs to (`Guild` rows): it waits in the line once for each. */
  serversOf(gymId: number): number[];
  /** A server's gyms (`GymDirectory.gymsOf`): the circle of its Wayspots' places. */
  gymsOf(guildId: number): Iterable<Gym>;
  refreshGym(id: number): Promise<Gym | undefined>;
  /** Re-reads the gyms of a block in one turn (`GymDirectory.refreshGyms`). */
  refreshGyms(ids: readonly number[]): Promise<Gym[]>;
}

export interface GymUpkeepOptions {
  gyms: Pick<GymStorage, 'update'>;
  directory: GymsInMemory;
  geo: GeoGateway;
  /** The active parties, to find those that show a gym. */
  parties: { active(): Party[] };
  /** Told of every party that shows a gym that changed, to render its post anew. */
  posts: { changed(partyId: string): void };
  log: Logger;
  /**
   * How long the gyms that wait for their places are apart: one of them is asked about every
   * so often. Default five seconds.
   */
  placesEveryMs?: number;
  /**
   * Starts the timer for the next gym that waits and gives the function that cancels it.
   * Default: `setTimeout`, unref'd. A test passes its own, or calls `flush`.
   */
  setTimer?: (run: () => void, ms: number) => () => void;
  /** The line (`GymLookupRepository` in the bot); default one in memory. */
  lookups?: GymLookups;
  /** The questions asked of Google per day (`GoogleUseRepository` in the bot); default in memory. */
  use?: GoogleUse;
  /** The monthly budget (`DEFAULT_GOOGLE_BUDGET`). */
  budget?: GoogleBudget;
  /**
   * How many lookups by hand (`/gym refresh`, a gym added or moved) may reach Google in a Pacific
   * month, counted in this database (`DEFAULT_BY_HAND_PER_MONTH`; `settings.googleByHandPerMonth`).
   */
  byHandPerMonth?: number;
  /**
   * Each server's floor of those in a Pacific month (plan 19B-5, `settings.googleByHandPerServer`;
   * `DEFAULT_BY_HAND_FLOOR`; `withinFloors`): a server under it may always make one within the
   * instance's cap, the floors of every server (`servers`) kept out of the cap, scaled down where
   * they add up to more; above it a server takes only of what the others' unused floors leave. A
   * Pine of one server has the whole cap.
   */
  byHandPerServer?: number;
  /** The servers Pine is in (`Guild` rows), each with its floor; default none but the asker. */
  servers?: () => readonly number[];
  /**
   * Google's month shared between servers by need (plan 19B-5, `GoogleShares`): the line serves
   * each server up to its share. Without it the line is one, as before.
   */
  shares?: GoogleShares;
  /**
   * Whether the line serves a server's rows (plan 19C-1; by `Guild` row), asked at each turn:
   * not one Pine left or that may no longer have it (`app.ts`: admitted and not left). A server
   * not served keeps its rows, which wait unasked, held out of the range the line reads
   * (`OUT_OF_SHARE_RANK`, as a server's out of its share), and count for no share, until it is
   * served again (ranked by its regions anew at the line's next turn, whatever made it served;
   * `servingChanged` hurries that turn) or plan 19C-3 deletes them.
   * Default: every server.
   */
  serves?: (guildId: number) => boolean;
  /** The ranks of the places of the line (`GoogleRanks` in the bot); default all alike. */
  ranks?: LineRanks;
  /**
   * The kept Wayspots and stops of Pine's own (`WayspotDirectory`): their PokéStops and Power
   * Spots in a region of a server wait in the line after the gyms (plan 8W-6). Without them only
   * gyms wait.
   */
  wayspots?: Pick<
    WayspotProvider,
    'servers' | 'of' | 'stored' | 'contentGeneration' | 'whenChanged'
  >;
  /**
   * The regions (`RegionDirectory`): after each load that changed a server's outlines that
   * server's part of the Wayspots' line follows them (plan 19B-3: the others' neither read nor
   * touched), so that a region added or saved queues the PokéStops and Power Spots it newly
   * covers at once (and lets go of those it no longer does), whatever else waits.
   */
  outlineChanges?: {
    whenOutlinesChanged(listener: (servers: readonly number[]) => void): void;
  };
  /** The Wayspots' line (`WayspotLookupRepository` in the bot); default one in memory. */
  wayspotLookups?: WayspotLookups;
  /**
   * Google's answers by the point (`GoogleAnswers`, plan 19B-3), where every address and list of
   * places the line asks for is kept, and where it looks first: a point answered is not asked
   * again, whichever server's gym or Wayspot waits there. The one the directory reads.
   */
  answers: GoogleAnswers;
  /** The places around PokéStops and Power Spots (`WayspotPlaces`); default one over `answers`. */
  places?: WayspotPlaces;
  /** Default `Date.now`. */
  now?: () => number;
}

/**
 * What follows from a change of a gym, behind the change itself: the directory and the posts
 * that show the gym (`gymChanged`), which gym is nearest to which (`placed`, `removed`), and
 * what Google knows of the place: its address (`geodata`) and the places around it (`places`),
 * by which the gym is found.
 *
 * Nothing waits for Google. A gym that was added or moved by hand is asked about at once, on
 * the side; the gyms whose nearest gym changed with it, and what a Wayfarer import adds and
 * moves, wait in a line (the circle places are looked for in is half the way to the nearest
 * gym), one every few seconds, the gyms of the best-ranked region first (`LineRanks`), within a
 * monthly budget (plan 8W-6, `lineAllowance`: the line stops when only the reserve is left;
 * every question that reaches Google counts, by hand too, and those by hand may use the reserve
 * and go past the budget, up to a hard monthly cap of their own, `byHandPerMonth`, plan 8Z: past
 * it a gym added or moved waits in the line like the others, and `/gym refresh` asks nothing).
 * The line is kept in the database
 * (`GymLookups`): a restart loses nothing, and `resume` takes it up at start. Only tests and the
 * shutdown wait for it (`flush`, `stop`). While Google refuses the key for places, the line
 * keeps its gyms and looks again when the refusal is over.
 *
 * Per server (plan 19B-3): a gym or Wayspot waits once for each server that has it, ranked by
 * that server's regions, and its place is asked once: what Google says is the point's
 * (`GoogleAnswers`), shown by every gym and Wayspot within ten meters of it in every server
 * meanwhile, and a row whose own point was answered meanwhile (`ownAt`: another server's copy
 * of the place asked, never a neighbor a few meters off) asks nothing (a gym its address; a
 * PokéStop or Power Spot its places). A gym's question answers every server's row of it. The
 * budget is the instance's.
 *
 * An answer is written only when nothing about its question has changed since it was asked: every
 * question about a gym has a number (`generation`), which goes up with each new question of its
 * kind for that gym and whenever the gym is put somewhere or gets another nearest gym. An answer
 * whose number is no longer the gym's is dropped, so an older answer never overwrites a newer
 * one, whichever comes first.
 *
 * The bookkeeping of nearest gyms assumes one change at a time: gym administration holds its
 * lock around `placed` and `removed`.
 */
export class GymUpkeep {
  private readonly placesEveryMs: number;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  /** The gyms that wait for Google (`GymLookups`). */
  private readonly lookups: GymLookups;
  private readonly use: GoogleUse;
  private readonly budget: GoogleBudget;
  private readonly byHandPerMonth: number;
  private readonly byHandPerServer: number;
  /** The lookups by hand on their way, not counted yet: the cap holds for those at once. */
  private byHandOnTheirWay = 0;
  /** Of those, each server's (by `Guild` row): its floor holds for them at once. */
  private readonly byHandOfServer = new Map<number, number>();
  private readonly shares: GoogleShares | undefined;
  /** Whether a reading of the shares waits for its turn (a server they do not know came). */
  private sharesWanted = false;
  /** Whether the last reading of the shares failed: the line's next turn reads them again. */
  private sharesUnread = false;
  private readonly ranks: LineRanks;
  /** The PokéStops and Power Spots that wait for Google. */
  private readonly wayspotLookups: WayspotLookups;
  private readonly answers: GoogleAnswers;
  private readonly places: WayspotPlaces;
  /** Whether the line was taken up (`resume`): only then a change of the Wayspots queues them. */
  private resumed = false;
  private readonly now: () => number;
  private readonly running = new Set<Promise<unknown>>();
  /**
   * The turn of the line: one gym at a time (`next`), since a gym stays in the line while it
   * is asked about (a restart then asks again) and must not be asked twice.
   */
  private turn: Promise<unknown> = Promise.resolve();
  /**
   * The gym the line is asking about now, until its turn is written down, and whether it was
   * put in the line again meanwhile (moved, or its nearest gym changed; `address`: for its
   * address too): then its row stays for another turn, since the answer on its way was asked
   * about the old place and is dropped.
   */
  private asking: { gymId: number; requeued: boolean; address: boolean } | undefined;
  /** The number of the newest question of each kind about each gym (`address:12`, `places:12`). */
  private readonly generation = new Map<string, number>();
  private cancelTimer: (() => void) | undefined;
  /** When the timer of the line fires (epoch ms, by `now`), while one is set. */
  private timerDue = 0;
  /** How long Google's refusal of the key for places still lasted when it was last met. */
  private deniedForMs = 0;
  /** Whether the last turn met that refusal: its wait is Google's, and new work keeps it. */
  private refusing = false;
  /** Whether a turn of the timer runs now; then `hurry` only notes new work (`newWork`). */
  private turning = false;
  private newWork = false;
  /**
   * The run of `queueWayspots` under way, and the servers another run was asked for meanwhile
   * (`all`: every server's part).
   */
  private wayspotsRun: Promise<void> | undefined;
  private wayspotsWanted: 'all' | Set<number> | undefined;
  /**
   * Until when Google refuses the key for Geocoding (epoch ms; 0: not refused): meanwhile the
   * line asks only about the gyms that wait for their places alone.
   */
  private geocodeRefusedUntil = 0;
  /** The Pacific day the line was last ranked on (`rerank`). */
  private rankedDay = '';
  /** The turns in a row whose questions did not answer: the line waits longer after each. */
  private misses = 0;
  /**
   * The gyms and the PokéStops and Power Spots whose question did not answer today: the line
   * passes over them until the next Pacific day (`rerank`), so that one item that keeps failing
   * holds up neither the others nor the budget; one put in the line anew (moved) is asked again.
   */
  private readonly asideGyms = new Set<number>();
  private readonly asideSpots = new Set<string>();
  /**
   * The servers not served (`serves`, plan 19C-1) a read of a line found a row of in its range, by
   * `Guild` row, of each line: rows written before their server's were held (`OUT_OF_SHARE_RANK`,
   * as `rankServer` and `queueWayspotsNow` hold them). That line's reads pass over their rows as
   * over those of a server out of its share, until a ranking of the line held them all; one served
   * again is dropped at the next turn.
   */
  private readonly unserved = { gyms: new Set<number>(), spots: new Set<number>() };
  /**
   * The servers whose rows were written held for not being served (`shareRank`, `rankServer`,
   * `queueWayspotsNow`), by `Guild` row: the line's next turn ranks anew each one served again
   * (`nextNow`), whatever made it served (an operator's word, a return), told or not; a ranking of
   * it while served (`rankServer`) drops it.
   */
  private readonly heldUnserved = new Set<number>();
  private stopped = false;

  constructor(private readonly options: GymUpkeepOptions) {
    this.placesEveryMs = options.placesEveryMs ?? 5_000;
    this.lookups = options.lookups ?? new MemoryGymLookups();
    this.use = options.use ?? new MemoryGoogleUse();
    this.budget = options.budget ?? DEFAULT_GOOGLE_BUDGET;
    this.byHandPerMonth = options.byHandPerMonth ?? DEFAULT_BY_HAND_PER_MONTH;
    this.byHandPerServer = options.byHandPerServer ?? DEFAULT_BY_HAND_FLOOR;
    this.shares = options.shares;
    this.ranks = options.ranks ?? SAME_RANK;
    this.wayspotLookups = options.wayspotLookups ?? new MemoryWayspotLookups();
    this.answers = options.answers;
    this.places = options.places ?? new WayspotPlaces({ answers: this.answers, log: options.log });
    this.now = options.now ?? Date.now;
    // What a server's Wayspots are changed (its import, a stop of Pine's own): that server's part
    // of the line follows, the others' left as they are.
    options.wayspots?.whenChanged((guildId) => {
      if (this.resumed) this.aside(() => this.queueWayspots(guildId));
    });
    // And where a server's regions are: a change of them is not a change of the Wayspots. Each
    // server whose outlines changed, its part alone (one run for them all).
    options.outlineChanges?.whenOutlinesChanged((servers) => {
      if (!this.resumed) return;
      for (const guildId of servers) this.aside(() => this.queueWayspots(guildId));
    });
    this.setTimer =
      options.setTimer ??
      ((run, ms) => {
        const timer = setTimeout(run, ms);
        timer.unref();
        return () => {
          clearTimeout(timer);
        };
      });
  }

  /** Whether Google is asked at all: without an API key a gym has neither address nor places. */
  get fetches(): boolean {
    return this.options.geo.enabled;
  }

  /** How many gyms wait in the line. */
  waiting(): Promise<number> {
    return this.lookups.count();
  }

  /**
   * The line as it is (`/gym google`): whether Google is asked at all, every gym and Wayspot
   * that waits in the line's order, this month's questions, the budget and the line's pace; with
   * a server (its `Guild` row, plan 19B-5), its share of the month, what the line asked of its
   * rows this month and its lookups by hand (its counts read by its key), and the ranks its rows
   * have by its regions (fix round 4, R6). The share is read in the line's turn (fix round 3, T5), never half-way
   * through a question or a reading; where the shares were never read or the last reading failed,
   * they are read then.
   */
  async snapshot(guildId?: number): Promise<GoogleLineSnapshot> {
    const { shares } = this;
    const share =
      guildId === undefined || !shares
        ? undefined
        : await this.inTurn(async () => {
            if (!shares.read || this.sharesUnread) await this.sharesInTurn();
            return shares.of(guildId);
          });
    const now = this.now();
    const gyms = await this.lookups.list();
    const wayspots = await this.wayspotLookups.list();
    let server: GoogleLineSnapshot['server'];
    if (guildId !== undefined) {
      const counted = (await this.use.serversUsedOn(googleMonth(now).days, guildId)).get(guildId);
      const ownRanks = { gyms: new Map<number, number>(), wayspots: new Map<string, number>() };
      for (const row of gyms) {
        if (row.guildId === guildId)
          ownRanks.gyms.set(row.gymId, this.ranks.ofGym(guildId, row.gymId));
      }
      for (const row of wayspots) {
        if (row.guildId !== guildId) continue;
        const rank = this.ranks.ofWayspot(guildId, row.wayspotId);
        if (rank !== undefined) ownRanks.wayspots.set(row.wayspotId, rank);
      }
      server = {
        share,
        used: { places: counted?.places ?? 0, geocodes: counted?.geocodes ?? 0 },
        ownRanks,
        byHand: counted?.byHand ?? 0,
        byHandFloor: serverFloor(
          this.byHandPerMonth,
          this.byHandPerServer,
          new Set([...this.serversPresent(), guildId]).size,
        ),
      };
    }
    return {
      fetches: this.fetches,
      gyms,
      wayspots,
      used: await usedThisMonth(this.use, now),
      budget: this.budget,
      byHandPerMonth: this.byHandPerMonth,
      everyMs: this.placesEveryMs,
      now,
      ...(server === undefined ? {} : { server }),
    };
  }

  /** How many PokéStops and Power Spots wait in the line. */
  waitingWayspots(): Promise<number> {
    return this.wayspotLookups.count();
  }

  /**
   * Brings the Wayspots' part of the line up to date with the Wayspots (after `resume`, at every
   * change of what they are, at every load of the regions that changed a server's outlines, and
   * with the daily ranking, which runs only while something waits): each server's PokéStop or
   * Power Spot in a region of that server (plan 19B-3: a row per server, ranked by its regions)
   * whose own point has no answer about its places (`GoogleAnswers.ownAt`, whichever server's
   * question it was) is queued (by its kind and rank); one no longer in a region of its server
   * leaves the line, and so does one that is no PokéStop or Power Spot any more (it became a gym,
   * was found gone, is a Wayfarer gym). The answers are the places', and stay. A server the line
   * does not serve (`serves`, plan 19C-1) has its rows held (`OUT_OF_SHARE_RANK`, their ranks
   * alone written), none added or taken out. Never rejects.
   *
   * With a server (`guildId`: its import, a change of its stops of Pine's own, of its outlines),
   * that server's part alone: its rows of the line are read by its key, the others' neither read
   * nor touched.
   *
   * One run at a time, so that an older run's writes never land after a newer run's (a region
   * removed while the run that queued its stops still writes): what asks while a run is under way
   * gets one more run after it, shared by every such request (of every server they named, or of
   * every server when one named none), and waits for that.
   */
  private queueWayspots(guildId?: number): Promise<void> {
    this.wayspotsWanted =
      guildId === undefined || this.wayspotsWanted === 'all'
        ? 'all'
        : new Set([...(this.wayspotsWanted ?? []), guildId]);
    if (this.wayspotsRun) return this.wayspotsRun;
    const run = (async () => {
      // Not before `wayspotsRun` is set: a run that ends at once must not outlive its own end.
      await Promise.resolve();
      try {
        while (this.wayspotsWanted !== undefined) {
          const servers = this.wayspotsWanted;
          this.wayspotsWanted = undefined;
          await this.queueWayspotsNow(servers);
        }
      } finally {
        this.wayspotsRun = undefined;
      }
    })();
    this.wayspotsRun = run;
    return run;
  }

  private async queueWayspotsNow(servers: 'all' | ReadonlySet<number>): Promise<void> {
    const { wayspots, log } = this.options;
    // Before the first load of the Wayspots nothing is known of them: nothing is dropped.
    if (!wayspots || wayspots.contentGeneration === 0 || !this.fetches || this.stopped) return;
    try {
      const rows =
        servers === 'all'
          ? await this.wayspotLookups.list()
          : (
              await Promise.all(
                [...servers].map((guildId) => this.wayspotLookups.ofServer(guildId)),
              )
            ).flat();
      const waiting = new Map(rows.map((row): [string, WaitingWayspot] => [spotKey(row), row]));
      const add: QueuedWayspot[] = [];
      const kept = new Set<string>();
      // Each server's own rows, once each (plan 19B-3): its copy, ranked by its regions. A server
      // the line does not serve (plan 19C-1: Pine left it) has none added or taken out: they wait,
      // held below, until it is back.
      for (const guildId of servers === 'all' ? wayspots.servers() : servers) {
        if (!this.serves(guildId)) continue;
        for (const wayspot of wayspots.of(guildId).all()) {
          if (wayspot.kind !== 'stop' && wayspot.kind !== 'powerspot') continue;
          const regionRank = this.ranks.ofWayspot(guildId, wayspot.id);
          if (regionRank === undefined) continue;
          const key = spotKey({ guildId, wayspotId: wayspot.id });
          kept.add(key);
          // Its own point answered, whichever server's question it was (`ownAt`): nothing is
          // written, and no reading of the shares started for it (fix round 3, T6).
          if (this.placesAsked(wayspot)) continue;
          // Held at the end while its server is out of its share (plan 19B-5).
          const rank = this.shareRank(guildId, false, regionRank);
          const queued = waiting.get(key);
          if (queued?.kind === wayspot.kind && queued.rank === rank) continue;
          add.push({ guildId, wayspotId: wayspot.id, kind: wayspot.kind, rank });
        }
      }
      // A server not served has its rows held, ranks alone written: out of the range the line's
      // reads walk (`next({ outOfShare })`), as an out-of-share server's.
      const read = new Set(rows.map((row) => row.guildId));
      const held = new Set<number>();
      for (const { guildId, wayspotId, kind, rank } of rows) {
        if (this.serves(guildId)) continue;
        held.add(guildId);
        this.heldUnserved.add(guildId);
        if (rank !== OUT_OF_SHARE_RANK) {
          add.push({ guildId, wayspotId, kind, rank: OUT_OF_SHARE_RANK });
        }
      }
      const leave = [...waiting].flatMap(([key, row]) =>
        kept.has(key) || !this.serves(row.guildId) ? [] : [row],
      );
      const note = this.beforeWrite(add.map((row) => ({ guildId: row.guildId, address: false })));
      await this.wayspotLookups.add(add, this.now());
      await this.wayspotLookups.remove(leave);
      this.afterWrite(note);
      // Of the servers read, those held and those without rows have none in the line's range:
      // its reads need not name them.
      for (const guildId of servers === 'all' ? [...this.unserved.spots] : servers) {
        if (held.has(guildId) || !read.has(guildId)) this.unserved.spots.delete(guildId);
      }
      if (add.some((row) => !held.has(row.guildId))) this.hurry();
    } catch (err) {
      log.warn(
        { err },
        'could not bring the PokéStops and Power Spots that wait for Google up to date',
      );
    }
  }

  /**
   * Takes up the line kept from before a restart (at start), and puts in it the gyms that have
   * no places and were never asked about where they are (no answer about the places of their own
   * point, `GoogleAnswers.ownAt`, plan 19B-3; Matt, 2026-10-16: "the upkeep finds them"): gyms
   * added while there was no key, or whose place in the line could not be written;
   * those without an address for it too. A gym Google found nothing for was asked (its answer
   * is a null), and is not asked again at every start. The ranks are read first, and the line
   * ranked anew by them (`rerank`).
   */
  async resume(): Promise<void> {
    if (this.fetches && !this.stopped) {
      await this.rerank();
      const never = this.options.directory.all().filter((gym) => !this.placesAsked(gym));
      const unaddressed = (gym: Gym) => !this.hasOwnAddress(gym);
      await this.queueGyms(
        never.filter(unaddressed).map((gym) => gym.id),
        true,
      );
      await this.queueGyms(
        never.filter((gym) => !unaddressed(gym)).map((gym) => gym.id),
        false,
      );
    }
    this.resumed = true;
    if (this.fetches && !this.stopped) await this.queueWayspots();
    this.schedule();
  }

  /**
   * After anything about a gym changed (its texts, its flags, its place; also when it was added
   * or deleted): the directory reads it again, and every active party that shows it (a raid
   * there, a train with it on its route, a meetup at it: `shownPlace`) has its post rendered
   * anew. Gives the gym as it is
   * now; undefined when it is gone.
   */
  async gymChanged(id: number): Promise<Gym | undefined> {
    const gym = await this.options.directory.refreshGym(id);
    this.showAnew(id);
    return gym;
  }

  private showAnew(gymId: number): void {
    const { parties, posts, log } = this.options;
    try {
      for (const party of parties.active()) {
        const shows = isRaid(party)
          ? party.gymId === gymId
          : isTrain(party)
            ? hasStop(party.train.route, gymStop(gymId))
            : isMeetup(party) &&
              party.meetup.place?.kind === 'gym' &&
              party.meetup.place.id === String(gymId);
        if (shows) posts.changed(party.id);
      }
    } catch (err) {
      log.warn({ err, gym: gymId }, 'could not render the posts that show a gym anew');
    }
  }

  /**
   * After a gym was added or moved (the directory has it where it is now): the nearest gyms of
   * the gyms concerned are written, which is waited for; then the gym is asked about on the
   * side, and the gyms whose places are now looked for in another circle wait in the line.
   * Never rejects: what fails is logged, and the gym stays as it is.
   *
   * `places: false` (a Wayfarer import's move of a few metres, `GymAdminService.batch`): only
   * the nearest gyms are written, and what was answered about the place it left (`from`) is its
   * new place's (plan 19B-3: the answers are kept by the point, `carry`). Google is asked about
   * nothing, neither this gym nor the gyms around it, then or at a later start: a few metres
   * change neither an address nor a circle of places, and every question costs money (an import
   * corrects thousands of gyms).
   *
   * `places: 'later'` (what a Wayfarer import adds or moves further): as without, but the gym
   * waits in the line for its address and its places, and the gyms around it for theirs, so
   * that an import of thousands of gyms asks Google one gym every few seconds, not all at once.
   * `address: false`: the gym waits for its places only (it took the Wayspot's address).
   */
  async placed(
    id: number,
    {
      places = true,
      address = true,
      from,
      guildId,
    }: {
      places?: boolean | 'later';
      address?: boolean;
      from?: LatLon;
      /** The server whose staff added or moved it: its lookup by hand counts against its floor. */
      guildId?: number | undefined;
    } = {},
  ): Promise<void> {
    if (!places) {
      if (from !== undefined) await this.carry(id, from);
      await this.settle({ placed: id });
      return;
    }
    // Whatever is on its way about this gym was asked about another place.
    this.outdate('address', id);
    this.outdate('places', id);
    const changed = await this.settle({ placed: id });
    // The gyms that have this one as their nearest: their circle follows it, also when a move
    // left it their nearest.
    const pointing = this.options.directory
      .all()
      .filter((gym) => gym.nearestGym === id)
      .map((gym) => gym.id);
    const others = [...changed, ...pointing].filter((other) => other !== id);
    // Their circle follows the distance to this gym: what was asked in the old circle is void.
    for (const other of pointing) this.outdate('places', other);
    // Past the cap of lookups by hand it never fails: it waits in the line like an import's.
    if (places === 'later' || (await this.takeByHand(guildId)) !== undefined) {
      await this.queueGyms([id], address);
      await this.queuePlaces(others);
      return;
    }
    this.aside(async () => {
      const refreshed = await this.askByHand(id, guildId);
      // Refused for now: it waits in the line like the others, for when the API may be asked.
      if (refreshed?.places === 'denied') await this.queuePlaces([id]);
      else if (refreshed) await this.answered(id);
    });
    await this.queuePlaces(others);
  }

  /**
   * After a block of gyms was added at once (plan 8W-6: `GymBatch.addBlock`, a Wayfarer import),
   * with their nearest gyms and those of the gyms around them written in the block's transaction
   * (`nearestBlockChanges`) and the directory read again: the new gyms wait in the line (for
   * their address too where they have none), and the gyms whose nearest gym changed wait for
   * their places, in one write of the line each. Google is asked about nothing at once. Never
   * rejects.
   */
  async placedBlock(ids: readonly number[], nearestChanged: readonly number[]): Promise<void> {
    const { directory } = this.options;
    for (const id of ids) {
      this.outdate('address', id);
      this.outdate('places', id);
    }
    const added = new Set(ids);
    const others = nearestChanged.filter((id) => !added.has(id));
    // Their circle follows the distance to their new nearest gym.
    for (const id of others) this.outdate('places', id);
    // An address of its own place (its Wayfarer address, an answer there): its places alone.
    const gyms = ids.flatMap((id) => directory.stored(id) ?? []);
    await this.queueGyms(
      gyms.filter((gym) => !this.hasOwnAddress(gym)).map((gym) => gym.id),
      true,
    );
    await this.queueGyms(
      gyms.filter((gym) => this.hasOwnAddress(gym)).map((gym) => gym.id),
      false,
    );
    await this.queuePlaces(others);
  }

  /**
   * After a gym was deleted (the directory no longer has it): the gyms that pointed at it get
   * another nearest gym, and wait in the line for their places. Never rejects.
   */
  async removed(id: number): Promise<void> {
    // The database takes the gym out of the line with its row; the twin in memory is told.
    await this.lookups.remove(id).catch((err: unknown) => {
      this.options.log.warn({ err, gym: id }, 'could not take a deleted gym out of the line');
    });
    this.generation.delete(`address:${id}`);
    this.generation.delete(`places:${id}`);
    await this.queuePlaces(await this.settle({ removed: id }));
  }

  /**
   * After a server unlinked a gym others keep (the directory has it with its servers now): its
   * nearest gyms are no longer the same (plan 19B-3: a gym's nearest is of the gyms that share a
   * server with it), so the gyms that pointed at it and the gym itself look for theirs anew, as
   * after a move where it is (`settle` of `placed`), and wait in the line for their places.
   * Never rejects.
   */
  async unlinked(id: number): Promise<void> {
    await this.queuePlaces(await this.settle({ placed: id }));
  }

  /**
   * After a server's data was deleted (plan 19C-3, `forgetServerMemory`): `removed` its gyms no
   * other server had (the directory no longer has them), `unlinked` those others keep (the
   * directory has them with their servers now). What `removed` and `unlinked` do for each, the
   * nearest gyms worked out once for all of them (`nearestAfterGone`): one pass over every gym
   * whatever the server's count, and one write of the line. Never rejects.
   */
  async serverGone(removed: readonly number[], unlinked: readonly number[]): Promise<void> {
    for (const id of removed) {
      // The database takes the gym out of the line with its row; the twin in memory is told.
      await this.lookups.remove(id).catch((err: unknown) => {
        this.options.log.warn({ err, gym: id }, 'could not take a deleted gym out of the line');
      });
      this.generation.delete(`address:${id}`);
      this.generation.delete(`places:${id}`);
    }
    const gone = { removed: new Set(removed), unlinked: new Set(unlinked) };
    const settled = await this.settleWith(
      (gyms, together) => nearestAfterGone(gyms, gone, together),
      { removed: removed.length, unlinked: unlinked.length },
    );
    await this.queuePlaces(settled);
  }

  /** Writes the nearest gyms an event changed; gives the gyms that were written. */
  private settle(event: NearestEvent): Promise<number[]> {
    return this.settleWith((gyms, together) => nearestGymChanges(gyms, event, together), event);
  }

  /**
   * Writes the nearest gyms `changesOf` works out of every gym (one pass over them), `about`
   * named in the log; gives the gyms that were written.
   */
  private async settleWith(
    changesOf: (gyms: readonly Gym[], together: Together) => readonly NearestChange[],
    about: object,
  ): Promise<number[]> {
    const { gyms, directory, log } = this.options;
    const done: number[] = [];
    try {
      // Per server (plan 19B-3): a gym's nearest is of the gyms that share a server with it.
      for (const change of changesOf(directory.all(), (a, b) =>
        sharesServer(directory.serversOf(a), directory.serversOf(b)),
      )) {
        await gyms.update(change.id, { nearestGym: change.nearestGym });
        await directory.refreshGym(change.id);
        // Another nearest gym is another circle to look for places in.
        this.outdate('places', change.id);
        done.push(change.id);
      }
    } catch (err) {
      log.warn({ err, ...about }, 'could not bring the nearest gyms up to date');
    }
    // One gym changes the nearest gym of a few around it. Many at once is a database whose
    // gyms had none yet (the first change settles them all): worth knowing, and no fault.
    if (done.length > MANY_NEAREST) {
      log.info({ count: done.length, ...about }, 'many gyms got another nearest gym');
    }
    return done;
  }

  /**
   * Asks Google about one gym now, its address and then its places, and writes what differs
   * (`/gym refresh`); past the cap of lookups by hand asks nothing and changes nothing (`capped`,
   * a gym in the line stays there). Undefined when there is no such gym. Rejects when a write
   * fails.
   */
  refresh(id: number, guildId?: number): Promise<GymRefresh | undefined> {
    const work = this.refreshByHand(id, guildId)
      .then(async (refreshed) => {
        if (
          refreshed &&
          refreshed.places !== 'denied' &&
          refreshed.places !== 'capped' &&
          refreshed.places !== 'count-unread'
        ) {
          await this.answered(id);
        }
        return refreshed;
      })
      .finally(() => this.running.delete(work));
    this.running.add(work);
    return work;
  }

  private async refreshByHand(id: number, guildId?: number): Promise<GymRefresh | undefined> {
    const gym = this.options.directory.stored(id);
    if (!gym) return undefined;
    const refused = await this.takeByHand(guildId);
    if (refused !== undefined) return { gym, geodata: refused, places: refused };
    return this.askByHand(id, guildId);
  }

  /**
   * Takes one of this month's lookups by hand (`askByHand` gives it back), or says why not: past
   * the cap, a hard one, or a count that cannot be read, for which nothing is asked either. Those
   * on their way count as used. Without a Google key nothing is asked, and nothing needs counting.
   * Shared between servers by floors (plan 19B-5, fix round 3, T3: `withinFloors`): the server
   * whose staff asked (none: the instance's own) under its floor always within the cap, above it
   * only of what the other servers' unused floors leave; every server's lookups by hand of the
   * month read by the day and the kind (`googleuseserverday_day_kind_index`).
   */
  private async takeByHand(guildId?: number): Promise<ByHandRefused | undefined> {
    this.byHandOnTheirWay += 1;
    if (guildId !== undefined) {
      this.byHandOfServer.set(guildId, (this.byHandOfServer.get(guildId) ?? 0) + 1);
    }
    if (!this.fetches) return undefined;
    const now = this.now();
    const refused = await Promise.all([
      usedThisMonth(this.use, now),
      this.use.serversCountedOn(googleMonth(now).days, 'hand'),
    ])
      .then(([used, servers]): ByHandRefused | undefined =>
        withinFloors({
          cap: this.byHandPerMonth,
          floor: this.byHandPerServer,
          servers: this.serversPresent(),
          usedOf: (server) => (servers.get(server) ?? 0) + (this.byHandOfServer.get(server) ?? 0),
          total: used.monthByHand + this.byHandOnTheirWay,
          guildId,
        })
          ? undefined
          : 'capped',
      )
      .catch((err: unknown) => {
        this.options.log.warn({ err }, 'could not read the lookups by hand');
        return 'count-unread' as const;
      });
    if (refused !== undefined) this.byHandDone(guildId);
    return refused;
  }

  /** The servers Pine is in now (`Guild` rows): each has its floor of lookups by hand. */
  private serversPresent(): readonly number[] {
    return this.options.servers?.() ?? [];
  }

  /** A lookup by hand is no longer on its way. */
  private byHandDone(guildId: number | undefined): void {
    this.byHandOnTheirWay -= 1;
    if (guildId === undefined) return;
    const left = (this.byHandOfServer.get(guildId) ?? 1) - 1;
    if (left > 0) this.byHandOfServer.set(guildId, left);
    else this.byHandOfServer.delete(guildId);
  }

  /**
   * A lookup by hand `takeByHand` took: counted once either of its questions reached Google,
   * whatever came after (the gym gone meanwhile, an answer that could not be written); with its
   * server, as that server's too (its questions are the instance's alone: no server's line).
   */
  private async askByHand(id: number, guildId?: number): Promise<GymRefresh | undefined> {
    let reached = false;
    try {
      return await this.refreshNow(id, () => {
        reached = true;
      });
    } finally {
      if (reached) await this.count('hand', guildId);
      this.byHandDone(guildId);
    }
  }

  private async refreshNow(id: number, onReached?: () => void): Promise<GymRefresh | undefined> {
    const geodata = await this.fetchGeodata(id, onReached);
    if (geodata === undefined) return undefined;
    const places = await this.fetchPlaces(id, onReached);
    const gym = this.options.directory.stored(id);
    return places === undefined || !gym ? undefined : { gym, geodata, places };
  }

  /**
   * Takes a gym that was just asked about by hand out of the line, unless the line is asking
   * about it this moment (its own turn decides then): it is not asked about twice.
   */
  private async answered(id: number): Promise<void> {
    if (this.asking?.gymId === id) return;
    await this.lookups.remove(id).catch((err: unknown) => {
      this.options.log.warn({ err, gym: id }, 'could not take a gym out of the line for Google');
    });
  }

  /** Makes every answer that is on its way about a gym one that is no longer wanted. */
  private outdate(kind: 'address' | 'places', id: number): void {
    const key = `${kind}:${id}`;
    this.generation.set(key, (this.generation.get(key) ?? 0) + 1);
  }

  /**
   * Notes a new question about a gym and gives the test for its answer: whether it is still the
   * newest question of its kind about that gym, and nothing has outdated it.
   */
  private question(kind: 'address' | 'places', id: number): () => boolean {
    this.outdate(kind, id);
    const key = `${kind}:${id}`;
    const asked = this.generation.get(key);
    return () => this.generation.get(key) === asked;
  }

  /**
   * Whether a gym's address is known for its own place: its own Wayfarer address, or Google's
   * answer at its own point (`GoogleAnswers.ownAt`; plan 19B-3), not a neighbor's within ten
   * meters, which is only shown meanwhile. The one rule of "has an address": the line's, gym
   * administration's (a gym it adds) and the Wayfarer import's (a gym it gives Wayfarer's).
   */
  hasOwnAddress(gym: Pick<Gym, 'lat' | 'lon' | 'wayfarerAddress'>): boolean {
    return gym.wayfarerAddress !== null || this.answers.ownAt('address', gym) !== undefined;
  }

  /** Whether the places around a gym's or Wayspot's own point were asked (`ownAt`). */
  private placesAsked(point: LatLon): boolean {
    return this.answers.ownAt('places', point) !== undefined;
  }

  /**
   * After a gym moved a few meters without a new question (`placed(…, { places: false })`): what
   * was answered about its old place is its new place's too (`GoogleAnswers.carry`). Never
   * rejects: what cannot be written is logged, and the gym waits in the line as one never asked.
   */
  private async carry(id: number, from: LatLon): Promise<void> {
    const gym = this.options.directory.stored(id);
    if (!gym) return;
    try {
      await this.answers.carry([{ from, to: gym }]);
    } catch (err) {
      this.options.log.warn({ err, gym: id }, 'could not keep the answers of a gym that moved');
    }
  }

  /**
   * The address of a gym's place, kept as its point's answer (`GoogleAnswers`) for every gym and
   * Wayspot there; undefined when the gym is gone. `server`: the line asked it of that server's
   * row, whose share it counts against (plan 19B-5).
   */
  private async fetchGeodata(
    id: number,
    onReached?: () => void,
    server?: number,
  ): Promise<FetchOutcome | undefined> {
    const { directory, geo } = this.options;
    const asked = directory.stored(id);
    if (!asked) return undefined;
    const wanted = this.question('address', id);
    const answer = await geo.reverseGeocode({ lat: asked.lat, lon: asked.lon });
    if (answer.ok || reachedGoogle(answer.reason)) {
      onReached?.();
      await this.count('geocode', server);
    }
    const gym = directory.stored(id);
    if (!gym) return undefined;
    if (!answer.ok) {
      if (answer.reason === 'denied') {
        this.geocodeRefusedUntil = this.now() + (answer.retryInMs ?? this.placesEveryMs);
      }
      return answer.reason;
    }
    // Moved, or asked about again, while Google was asked: a newer answer is the one to write.
    if (!wanted()) return 'unchanged';
    const geodata = geodataJson(answer.value);
    // The point's answer, over what was kept there, for every server (the directory shows it).
    await this.answers.save([
      { kind: 'address', lat: asked.lat, lon: asked.lon, answer: geodata, askedAt: this.now() },
    ]);
    // Asked by hand of a gym that showed Wayfarer's address (the line never asks one that has
    // it, a gym added or moved by hand has none): Google's is shown from now on, the gym's own
    // given up, as staff asked Google about the place. Only the one it showed when Google was
    // asked: one an import wrote meanwhile is newer than the question, and stays.
    if (asked.wayfarerAddress !== null && gym.wayfarerAddress === asked.wayfarerAddress) {
      await this.options.gyms.update(id, { wayfarerAddress: null });
      await directory.refreshGym(id);
    }
    // Compared with what the gym showed: its own Wayfarer address, else its point's answer.
    return geodata === gym.geodata ? 'unchanged' : 'updated';
  }

  /**
   * The places around a gym, within half the way to its nearest gym, kept as its point's answer
   * (a null when Google found none: the point was asked); undefined when the gym is gone.
   */
  private async fetchPlaces(
    id: number,
    onReached?: () => void,
    server?: number,
  ): Promise<FetchOutcome | undefined> {
    const { directory, geo } = this.options;
    const asked = directory.stored(id);
    if (!asked) return undefined;
    const nearest = asked.nearestGym === null ? undefined : directory.stored(asked.nearestGym);
    const radius = placesRadius(nearest && metresBetween(asked, nearest));
    const wanted = this.question('places', id);
    const answer = await geo.placesNear({ lat: asked.lat, lon: asked.lon }, radius);
    if (answer.ok || reachedGoogle(answer.reason)) {
      onReached?.();
      await this.count('places', server);
    }
    const gym = directory.stored(id);
    if (!gym) return undefined;
    if (!answer.ok) {
      if (answer.reason === 'denied') this.deniedForMs = answer.retryInMs ?? this.placesEveryMs;
      return answer.reason;
    }
    if (!wanted()) return 'unchanged';
    const places = placesText(answer.value);
    // Kept whatever Google found: a start does not put it in the line again.
    await this.answers.save([
      { kind: 'places', lat: asked.lat, lon: asked.lon, answer: places, askedAt: this.now() },
    ]);
    return places === gym.places ? 'unchanged' : 'updated';
  }

  private queuePlaces(ids: readonly number[]): Promise<void> {
    return this.queueGyms(ids, false);
  }

  /**
   * Puts gyms in the line; `address`: for their address too (one that waits for it keeps it).
   * Never rejects: a line that cannot be written is logged, and the gym keeps what it has
   * (`/gym refresh` asks again).
   */
  private async queueGyms(ids: readonly number[], address: boolean): Promise<void> {
    if (this.stopped || !this.fetches || ids.length === 0) return;
    // Put in the line anew (moved, another nearest gym): asked again, set aside or not.
    for (const id of ids) this.asideGyms.delete(id);
    const { asking } = this;
    if (asking && ids.includes(asking.gymId)) {
      asking.requeued = true;
      asking.address ||= address;
    }
    const rows = ids.flatMap((gymId) => this.queued(gymId, address));
    const note = this.beforeWrite(rows);
    try {
      await this.lookups.add(rows, this.now());
    } catch (err) {
      this.options.log.warn({ err, gyms: ids.length }, 'could not put gyms in the line for Google');
      return;
    }
    this.afterWrite(note);
    this.hurry();
  }

  /**
   * After new work came into the line: the line goes on at its usual pace, whatever long wait
   * its timer was set for (the day's share of PokéStops and Power Spots used, only what failed
   * today left, the month used up): the turn works out anew what may be asked. A wait that is
   * Google's own (its refusal of the key, or the longer waits after questions that did not
   * answer) is kept.
   */
  private hurry(): void {
    // During a turn there is no timer to judge: the turn's end decides, knowing its own wait.
    if (this.turning) {
      this.newWork = true;
      return;
    }
    if (
      this.cancelTimer &&
      !this.refusing &&
      this.misses === 0 &&
      this.timerDue - this.now() > this.placesEveryMs
    ) {
      this.cancelTimer();
      this.cancelTimer = undefined;
    }
    this.schedule();
  }

  /**
   * A gym as the line takes it: a row for each of its servers (plan 19B-3), each with the rank of
   * its best region of that server (`rank`: this rank for every row). A gym of no server waits
   * for none.
   */
  private queued(gymId: number, address: boolean, rank?: number): QueuedGym[] {
    return this.options.directory.serversOf(gymId).map((guildId) => ({
      guildId,
      gymId,
      address,
      rank: this.shareRank(guildId, address, rank ?? this.ranks.ofGym(guildId, gymId)),
    }));
  }

  /**
   * A row's rank as the line keeps it (plan 19B-5): `OUT_OF_SHARE_RANK` while its server is out
   * of its share (`GoogleShares.rank`), else its own; never for a server the shares do not know
   * (fix round 3, T1: nothing of it, or of the kind, waited when they were worked out, or the line
   * has asked about all that did), whose row the writer has worked out anew (`beforeWrite`,
   * `afterWrite`; which also rank a server again whose being held changed during the write). A
   * server the line does not serve (plan 19C-1) is held as one out of its share: its rows are out
   * of the range the line's reads walk, whatever its share, and noted (`heldUnserved`) to be
   * ranked anew once it is served again.
   */
  private shareRank(guildId: number, address: boolean, rank: number): number {
    if (!this.serves(guildId)) {
      this.heldUnserved.add(guildId);
      return OUT_OF_SHARE_RANK;
    }
    const { shares } = this;
    if (!shares?.knows(guildId, address)) return rank;
    return shares.rank(guildId, address, rank);
  }

  /** Whether the line serves a server's rows now (`GymUpkeepOptions.serves`, plan 19C-1). */
  private serves(guildId: number): boolean {
    return this.options.serves?.(guildId) ?? true;
  }

  /**
   * Servers whose being served changed (plan 19C-1: Pine left them, or they came back; `serves`
   * says which now): the shares are worked out anew in the line's turn (without those not served,
   * with those back), then each server's rows are ranked anew in the line's turn (`rankServer`,
   * its Wayspots' part brought up to date as after its import): held out of the line's range while
   * it is not served, ranked by its regions when it is back, by the raids read anew first (those
   * of a server away are not read: `GoogleRanks.refresh`); and the line goes on at its usual pace
   * (`hurry`), whatever long wait its timer was set for.
   */
  servingChanged(guildIds: readonly number[]): void {
    if (this.stopped || !this.fetches) return;
    this.sharesAnew();
    this.aside(() =>
      this.inTurn(async () => {
        if (guildIds.some((guildId) => this.serves(guildId))) {
          try {
            await this.ranks.refresh();
          } catch (err) {
            this.options.log.warn(
              { err },
              'could not read the raids of the regions: a server back is ranked as before',
            );
          }
        }
        for (const guildId of guildIds) await this.rankServer(guildId);
      }),
    );
    this.hurry();
  }

  /**
   * The servers whose rows were held for not being served (`heldUnserved`) and that are served
   * now, whatever made them so (an operator's allow or unblock, a return; told by `servingChanged`
   * or not): the raids read anew once (`LineRanks.refresh`, as `servingChanged` does), then each
   * one's rows ranked by its regions (`rankServer`, which drops it from the set), its Wayspots'
   * part brought up to date before the turn reads the line. Only in the line's turn; never
   * rejects.
   */
  private async rankServedAgain(): Promise<void> {
    const back = [...this.heldUnserved].filter((guildId) => this.serves(guildId));
    if (back.length === 0) return;
    try {
      await this.ranks.refresh();
    } catch (err) {
      this.options.log.warn(
        { err },
        'could not read the raids of the regions: a server served again is ranked as before',
      );
    }
    for (const guildId of back) await this.rankServer(guildId);
    if (this.resumed) await Promise.all(back.map((guildId) => this.queueWayspots(guildId)));
  }

  /** Whether a server's row is held as `shareRank` ranks it now (`OUT_OF_SHARE_RANK`). */
  private isHeld(guildId: number, address: boolean): boolean {
    if (!this.serves(guildId)) return true;
    const { shares } = this;
    return shares !== undefined && shares.knows(guildId, address) && shares.holds(guildId, address);
  }

  /**
   * What a writer notes of the rows it is about to write, before the write (their ranks are
   * `shareRank`'s of this moment): the servers the shares do not know (fix round 3, T1), and
   * whether each server's rows (of places alone, or with an address) were ranked as held (fix
   * round 4, R3; also by not being served, plan 19C-1). `afterWrite` takes it.
   */
  private beforeWrite(rows: readonly { guildId: number; address: boolean }[]): WriteNote {
    const note: WriteNote = { unknown: new Set(), held: new Map() };
    const { shares } = this;
    // Neither shares nor servers left out: no row is ever held.
    if (!shares && this.options.serves === undefined) return note;
    for (const { guildId, address } of rows) {
      // A server the line does not serve has no share to work out (plan 19C-1).
      if (shares?.knows(guildId, address) === false && this.serves(guildId)) {
        note.unknown.add(guildId);
      }
      note.held.set(`${String(guildId)}:${String(address)}`, {
        guildId,
        address,
        held: this.isHeld(guildId, address),
      });
    }
    return note;
  }

  /**
   * After a writer's own rows were written (`note` taken before the write). Some of servers the
   * shares did not know: the shares are worked out anew, by a reading that comes after this write
   * (a database's write may land after a reading asked at once would have counted the need); each
   * writer starts its own (fix round 3, T1): one that lands after another writer's reading started
   * has one of its own. A server whose rows were ranked held, or not, and are no longer so by the
   * shares now (a reading or a raise landed during the write, and ranked the server's rows before
   * these were there: fix round 4, R3): its rows are ranked again in the line's turn, as after a
   * count.
   */
  private afterWrite(note: WriteNote): void {
    if (note.unknown.size > 0) this.sharesAnew();
    const changed = new Set<number>();
    for (const { guildId, address, held } of note.held.values()) {
      if (this.isHeld(guildId, address) !== held) changed.add(guildId);
    }
    for (const guildId of changed) this.aside(() => this.inTurn(() => this.rankServer(guildId)));
  }

  /**
   * Works the shares out anew in the line's turn (one at a time with the questions, so that a
   * count is never read and counted twice), and ranks anew the rows of the servers whose being
   * out of their share changed. Asked again while one waits to start, it runs once: a reading
   * that has not started yet reads every write landed before it.
   */
  private sharesAnew(): void {
    if (this.sharesWanted || this.stopped) return;
    this.sharesWanted = true;
    this.aside(() =>
      this.inTurn(async () => {
        this.sharesWanted = false;
        await this.sharesInTurn();
      }),
    );
  }

  /**
   * Runs work in the line's turn: after the question asked now and every reading and ranking
   * asked before, and before what is asked after. Gives what the work gives.
   */
  private inTurn<T>(work: () => Promise<T>): Promise<T> {
    const run = this.turn.then(work);
    this.turn = run.catch(() => undefined);
    return run;
  }

  /**
   * Reads the shares (`readShares`) and ranks anew the servers whose being out changed, and
   * `also` (a server whose share was raised). Only in the line's turn. Whether the reading worked:
   * when it fails, the line's next turn reads them again (`sharesUnread`).
   */
  private async sharesInTurn(also?: number): Promise<boolean> {
    const changed = await this.readShares();
    if (changed === undefined) return false;
    if (also !== undefined) changed.add(also);
    for (const guildId of changed) await this.rankServer(guildId);
    return true;
  }

  /**
   * Reads every server's need (its rows of both lines) and works the shares out by it. Gives
   * the servers whose being out of their share changed; none without shares; undefined when a
   * reading fails (logged: the shares stay as they were, and `sharesUnread` has the line's next
   * turn read them again). A server the line does not serve (`serves`, plan 19C-1: Pine left it)
   * needs nothing: its rows count for no share, and are held out of the line's range
   * (`shareRank`).
   */
  private async readShares(): Promise<Set<number> | undefined> {
    const { shares } = this;
    if (!shares) return new Set();
    try {
      const needs = await this.lookups.needs();
      for (const [guildId, spots] of await this.wayspotLookups.needs()) {
        const kept = needs.get(guildId) ?? { places: 0, geocodes: 0 };
        needs.set(guildId, { ...kept, places: kept.places + spots });
      }
      for (const guildId of [...needs.keys()]) {
        if (!this.serves(guildId)) needs.delete(guildId);
      }
      const changed = await shares.refresh(needs);
      this.sharesUnread = false;
      return changed;
    } catch (err) {
      this.options.log.warn({ err }, 'could not work out the servers’ shares of Google');
      this.sharesUnread = true;
      return undefined;
    }
  }

  /**
   * Ranks one server's rows anew (its share used or raised, its being served changed): its gyms
   * read by its key and their ranks set where they changed, then its part of the Wayspots' line.
   * Only in the line's turn. Never rejects.
   */
  private async rankServer(guildId: number): Promise<void> {
    try {
      const rows = await this.lookups.ofServer(guildId);
      const changed: GymRank[] = [];
      const served = this.serves(guildId);
      for (const row of rows) {
        const rank = this.shareRank(guildId, row.address, this.ranks.ofGym(guildId, row.gymId));
        if (rank !== row.rank) changed.push({ guildId, gymId: row.gymId, rank });
      }
      // Rows of it the shares do not know (the line asked about all they knew): worked out anew.
      const note = this.beforeWrite(rows);
      await this.lookups.setRanks(changed);
      this.afterWrite(note);
      // Not served: every row of it is held now, and the line's reads need not name it. Served:
      // its rows are ranked by its regions, its Wayspots' part below.
      if (!served) this.unserved.gyms.delete(guildId);
      else this.heldUnserved.delete(guildId);
    } catch (err) {
      this.options.log.warn({ err, guild: guildId }, 'could not rank a server’s part of the line');
    }
    if (this.resumed) this.aside(() => this.queueWayspots(guildId));
    this.hurry();
  }

  /**
   * Raises a server's share of this month by `extra` (`/operator google share`, plan 19B-5; 0
   * takes a raise back): written, then in the line's turn the shares worked out anew and the
   * server's rows (and those of every server whose being out changed) ranked by them. Gives the
   * server's part of the month as it is then; undefined without shares; `later` when the raise
   * was written but the shares could not be worked out now (fix round 3, T10: the line's next turn
   * works them out). Rejects when the raise cannot be written.
   */
  async raiseShare(
    guildId: number,
    extra: number,
  ): Promise<ServerMonthShare | 'later' | undefined> {
    const { shares } = this;
    if (!shares) return undefined;
    await shares.raise(guildId, extra);
    return this.inTurn(async () =>
      (await this.sharesInTurn(guildId)) ? shares.of(guildId) : ('later' as const),
    );
  }

  /**
   * Counts a question or a lookup by hand that reached Google, on its Pacific day; with `server`,
   * as that server's too (plan 19B-5), and a question of the line against its share: a server out
   * of it with this one (or no longer) has its rows ranked anew, in the line's turn after this
   * one (fix round 3, T4). Never rejects.
   */
  private async count(question: GoogleCount, server?: number): Promise<void> {
    try {
      await this.use.use(googleMonth(this.now()).today, question, server);
    } catch (err) {
      this.options.log.warn({ err, question }, 'could not count a question asked of Google');
    }
    if (
      server !== undefined &&
      (question === 'places' || question === 'geocode') &&
      this.shares?.counted(server, question) === true
    ) {
      this.aside(() => this.inTurn(() => this.rankServer(server)));
    }
  }

  /**
   * Reads the ranks of the regions anew and ranks the line by them: at start, and at the first
   * turn of each Pacific day (the rank is not worked out per question). Never rejects: what
   * cannot be read leaves the ranks as they were.
   */
  private async rerank(): Promise<void> {
    const { log } = this.options;
    this.rankedDay = googleMonth(this.now()).today;
    // A new day: what failed before is asked again, in its place by its rank.
    this.asideGyms.clear();
    this.asideSpots.clear();
    // Each server's share of the month (plan 19B-5): worked out every day, so on the 1st anew
    // and for a server whose need grew or whose neighbors' went; every row is ranked by it below.
    const shareChanged = (await this.readShares()) ?? new Set<number>();
    try {
      await this.ranks.refresh();
    } catch (err) {
      log.warn({ err }, 'could not read the raids of the regions: the line keeps its order');
      // Its order by the regions, but the servers whose share changed are ranked by it.
      for (const guildId of shareChanged) await this.rankServer(guildId);
      return;
    }
    try {
      const rows = await this.lookups.list();
      const changed: GymRank[] = [];
      // Those not served (plan 19C-1) are held as one out of its share is (`shareRank`).
      const held = new Set([...this.unserved.gyms].filter((guildId) => !this.serves(guildId)));
      for (const row of rows) {
        const rank = this.shareRank(
          row.guildId,
          row.address,
          this.ranks.ofGym(row.guildId, row.gymId),
        );
        if (rank !== row.rank) changed.push({ guildId: row.guildId, gymId: row.gymId, rank });
      }
      const note = this.beforeWrite(rows);
      await this.lookups.setRanks(changed);
      this.afterWrite(note);
      // Every row of them is held now: the line's reads need not name them.
      for (const guildId of held) this.unserved.gyms.delete(guildId);
    } catch (err) {
      log.warn({ err }, 'could not rank the line of gyms that wait for Google anew');
    }
    // The Wayspots' part: ranked anew, and one that came into a region (or left every one)
    // since is queued (or leaves): a change of the regions is not a change of the Wayspots.
    if (this.resumed) await this.queueWayspots();
  }

  /**
   * Sets the timer for the next gym of the line: after the usual pause, or after `waitMs`, but
   * never longer than `MAX_TIMER_MS` (the turn then finds nothing to ask and sets the next). The
   * line itself says whether anything waits: a timer that finds it empty sets no other.
   */
  private schedule(waitMs = this.placesEveryMs): void {
    if (this.cancelTimer || this.stopped || !this.fetches) return;
    const ms = Math.min(MAX_TIMER_MS, Math.max(waitMs, this.placesEveryMs));
    this.timerDue = this.now() + ms;
    this.cancelTimer = this.setTimer(() => {
      this.cancelTimer = undefined;
      this.aside(async () => {
        this.turning = true;
        this.newWork = false;
        let next: number | 'empty' | undefined;
        try {
          next = await this.next();
        } finally {
          this.turning = false;
        }
        const hurried = this.newWork;
        this.newWork = false;
        if (next === 'empty') {
          // Work that came during the turn, after it found the line empty.
          if (hurried) this.schedule();
          return;
        }
        // The turn's wait stands, unless work came meanwhile and the wait is not Google's own
        // (as `hurry`); a timer set by anything else during the turn gives way to it.
        const wait = hurried && !this.refusing && this.misses === 0 ? this.placesEveryMs : next;
        this.cancelTimer?.();
        this.cancelTimer = undefined;
        this.schedule(wait);
      });
    }, ms);
  }

  /**
   * Asks about the first gym of the line, as the budget allows (`lineAllowance`). Never rejects.
   * Answers `empty` when nothing waits, how long to wait when nothing may be asked now (until the
   * month resets once only the reserve is left; while Geocoding is refused or the month's
   * geocodes are used, the gyms that want their places alone are still asked about, and the line
   * waits only when none is left: as long as the refusal lasts, or until the month resets), as
   * long as Google refuses the key for places (the gym stays the first of the line), `empty` too
   * once the last gym was asked about, and undefined when more wait. Each question that reached
   * Google is counted by itself (`count`); a gym whose places failed, or whose address did not
   * come, goes to the end of the line (still waiting for its address), and one put in the line
   * again before its turn was written down stays in it.
   */
  private next(): Promise<number | 'empty' | undefined> {
    return this.inTurn(() => this.nextNow());
  }

  private async nextNow(): Promise<number | 'empty' | undefined> {
    const { log } = this.options;
    this.refusing = false;
    let first;
    let spot: WaitingWayspot | undefined;
    /** Whether this turn read the shares (a failed reading is tried once a turn). */
    let read = false;
    try {
      const now = this.now();
      if (googleMonth(now).today !== this.rankedDay) {
        await this.rerank();
        read = true;
      }
      // The last reading failed (a raise's, say): this turn reads them again.
      if (this.sharesUnread && !read) {
        await this.sharesInTurn();
        read = true;
      }
      const allowance = lineAllowance(now, await usedThisMonth(this.use, now), this.budget);
      // While Geocoding is refused, or its budget used, the gyms that wait for their address
      // wait; the others go on, then the PokéStops and Power Spots.
      const refusedFor = this.geocodeRefusedUntil - now;
      const placesOnly = refusedFor > 0 || !allowance.geocode;
      // By shares (plan 19B-5): a server out of its share waits, the others go on. A server the
      // line does not serve (plan 19C-1) has its rows held out of the range read, as one out of
      // its share; a row of it written before they were held is passed over (`unserved`).
      for (const line of [this.unserved.gyms, this.unserved.spots]) {
        for (const guildId of line) if (this.serves(guildId)) line.delete(guildId);
      }
      // One whose rows were held and that is served again, whether or not the line was told
      // (`servingChanged`): ranked by its regions before this turn reads the line.
      await this.rankServedAgain();
      first = allowance.gyms
        ? await this.servedRow(this.unserved.gyms, () => {
            const outOfShare = this.outOfShareOrUnserved(this.unserved.gyms);
            return this.lookups.next({
              placesOnly,
              except: this.asideGyms,
              ...(outOfShare === undefined ? {} : { outOfShare }),
            });
          })
        : undefined;
      if (!first) {
        spot = allowance.wayspots
          ? await this.servedRow(this.unserved.spots, () => {
              const outOfShare = this.outOfShareOrUnserved(this.unserved.spots);
              return this.wayspotLookups.next({
                except: this.asideSpots,
                ...(outOfShare === undefined ? {} : { outOfShare: outOfShare.places }),
              });
            })
          : undefined;
        if (!spot) {
          // Whether anything waits: one row read of each line, never a count.
          const gyms = await this.lookups.any();
          const spots = await this.wayspotLookups.any();
          if (!gyms && !spots) return 'empty';
          if (!allowance.gyms) {
            // The month above the reserve is used, for every server: the owner hears of it.
            this.shares?.budgetUsed();
            return allowance.waitMs;
          }
          const month = googleMonth(now);
          // Rows of servers the line does not serve alone (plan 19C-1, held) wait for the month
          // too, a turn every `MAX_TIMER_MS`, which ranks anew one served again
          // (`rankServedAgain`); a change told to the line hurries it (`servingChanged`).
          return Math.min(
            // Only gyms that wait for their address are left.
            gyms && refusedFor > 0 && allowance.geocode ? refusedFor : month.nextReset - now,
            // The day's share of stops and Power Spots is used.
            spots ? month.tomorrow - now : Number.POSITIVE_INFINITY,
            // What failed today is asked again tomorrow; a server out of its share may have
            // more tomorrow, when the shares are worked out anew.
            this.asideGyms.size + this.asideSpots.size > 0 || this.shares?.anyOut() === true
              ? month.tomorrow - now
              : Number.POSITIVE_INFINITY,
          );
        }
      }
    } catch (err) {
      log.warn({ err }, 'could not read the line of gyms that wait for Google');
      return this.placesEveryMs;
    }
    // A row of a server the shares do not know, however it came into the line (a start's, a
    // write whose reading failed): they are worked out first (fix round 3, T1), and a row whose
    // server is out of its share by them waits; the next turn takes the next row.
    const row = first ?? spot;
    const forAddress = first?.address ?? false;
    if (row && !read && this.shares?.knows(row.guildId, forAddress) === false) {
      if ((await this.sharesInTurn()) && this.shares.holds(row.guildId, forAddress)) {
        return undefined;
      }
    }
    if (!first) return spot ? this.askWayspot(spot) : 'empty';
    const { gymId, address } = first;
    const asking = { gymId, requeued: false, address: false };
    this.asking = asking;
    try {
      // Each question by itself: the address (for a gym that waits for it), then the places.
      // Undefined: not asked (the gym is gone, or went while Google was asked).
      let geodata: FetchOutcome | undefined;
      let places: FetchOutcome | undefined;
      let thrown = false;
      try {
        // An address its own point has meanwhile (another server's row of it asked, a Wayspot
        // there), or its own Wayfarer address, is not asked again; its places are (they may be
        // wanted for another circle).
        const gym = this.options.directory.stored(gymId);
        if (address) {
          geodata =
            gym && this.hasOwnAddress(gym)
              ? 'unchanged'
              : await this.fetchGeodata(gymId, undefined, first.guildId);
        }
        // Geocoding refused: its places are not asked (and billed) without its address; the
        // gym waits, first of the line, as long as the refusal lasts.
        if (geodata !== 'denied' && (!address || geodata !== undefined)) {
          places = await this.fetchPlaces(gymId, undefined, first.guildId);
        }
      } catch (err) {
        log.warn({ err, gym: gymId }, 'could not bring the places of a gym up to date');
        thrown = true;
      }
      const gone = !thrown && geodata !== 'denied' && places === undefined;
      // Its address still to come: the geocode was not answered (failed, refused, not asked).
      const wantsAddress = address && geodata !== 'updated' && geodata !== 'unchanged';
      // Geocoding refused: the gym stays where it is in the line, waiting for its address, and
      // the line goes on with the gyms that wait for their places alone (`geocodeRefusedUntil`).
      if (geodata === 'denied') return undefined;
      if (!gone && places === 'denied' && !this.stopped) {
        // Only what was not answered waits; the gym stays the first of the line. An address
        // asked for again during the turn (it moved) still waits.
        if (address && !wantsAddress && !asking.address) {
          await this.lookups.setAddress(gymId, false);
        }
        this.refusing = true;
        return this.deniedForMs;
      }
      if (!gone && (thrown || places === 'failed' || wantsAddress)) {
        // Asked again for what did not come, the next day (`asideGyms`, which the line passes
        // over meanwhile; its row waits after every other gym until the line is ranked anew,
        // `RETRY_RANK`); and the line waits longer after each such turn in a row, so that a
        // Google that keeps failing does not take the month's budget a few seconds at a time
        // (the budget allows the gyms the whole month at once). One put in the line again
        // meanwhile (moved) is neither set aside nor put behind: its row stays as it was put
        // in the line, and waits for the address that did not come too.
        if (asking.requeued) {
          await this.putBack(this.queued(gymId, wantsAddress));
        } else {
          this.asideGyms.add(gymId);
          await this.lookups.remove(gymId);
          await this.putBack(this.queued(gymId, wantsAddress || asking.address, RETRY_RANK));
        }
        this.misses++;
        return Math.min(MAX_RETRY_WAIT_MS, this.placesEveryMs * 2 ** this.misses);
      } else if (!asking.requeued) {
        await this.lookups.remove(gymId);
        // Put in the line again while it was being taken out: the newer request stays.
        if (asking.requeued) await this.putBack(this.queued(gymId, asking.address));
      }
      this.misses = 0;
      // The last one: no timer is left for an empty line.
      if (!(await this.lookups.any()) && !(await this.wayspotLookups.any())) return 'empty';
    } catch (err) {
      log.warn({ err, gym: gymId }, 'could not take a gym out of the line for Google');
    } finally {
      // Only now: a gym put in the line again until here keeps its row (`queueGyms`).
      this.asking = undefined;
    }
    return undefined;
  }

  /**
   * What a line's read passes over (`next({ outOfShare })`): the rows held (`OUT_OF_SHARE_RANK`:
   * of servers out of their share, plan 19B-5, or not served, plan 19C-1), read above them alone,
   * the servers out of their share, and those not served a row of which was found in that range
   * (the line's `unserved`) as out of places. Undefined where no row can be held (neither shares
   * nor `serves`): the line reads in its plain order.
   */
  private outOfShareOrUnserved(unserved: ReadonlySet<number>): OutOfShare | undefined {
    const out = this.shares?.outOfShare();
    if (unserved.size === 0 && (out !== undefined || this.options.serves === undefined)) return out;
    return {
      places: new Set([...(out?.places ?? []), ...unserved]),
      geocodes: out?.geocodes ?? new Set(),
    };
  }

  /**
   * The first row a read of a line gives of a server the line serves (plan 19C-1): a row of one it
   * does not serve (written before its rows were held, or the line not told yet) adds that server
   * to the line's `unserved`, has its rows held in a later turn (`rankServer`), and the line is
   * read again past it. Each read passes over one more server, so it ends.
   */
  private async servedRow<T extends { guildId: number }>(
    unserved: Set<number>,
    read: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    for (;;) {
      const row = await read();
      if (row === undefined || this.serves(row.guildId)) return row;
      const { guildId } = row;
      unserved.add(guildId);
      this.aside(() => this.inTurn(() => this.rankServer(guildId)));
    }
  }

  /**
   * Puts a gym's rows back in the line in its turn; a row of a server the shares do not know has
   * them worked out after the write (`afterWrite`), in a turn after this one.
   */
  private async putBack(rows: readonly QueuedGym[]): Promise<void> {
    const note = this.beforeWrite(rows);
    await this.lookups.add(rows, this.now());
    this.afterWrite(note);
  }

  /**
   * The turn of a server's PokéStop or Power Spot: its places, within half the way to the nearest
   * gym, PokéStop or Power Spot (`placesRadius`), never its address, kept as its point's answer
   * (`GoogleAnswers`, plan 19B-3). Its server's search is told (`WayspotPlaces.changed`). One whose
   * place was answered meanwhile (another server's row of it, a gym there) leaves the line unasked,
   * its server told; one no longer a PokéStop or Power Spot leaves it unasked; one whose question
   * failed waits after the others of its kind, and the line waits longer (as for gyms); while
   * Google refuses the key for places it stays first. Answers as `next`.
   */
  private async askWayspot(item: WaitingWayspot): Promise<number | 'empty' | undefined> {
    const { geo, log, wayspots } = this.options;
    const { guildId, wayspotId: id } = item;
    /** Its places are kept: what fails after is no failed question, and is not asked again. */
    let saved = false;
    try {
      const wayspot = wayspots?.stored(guildId, id);
      if (!wayspot || (wayspot.kind !== 'stop' && wayspot.kind !== 'powerspot')) {
        await this.wayspotLookups.remove([item]);
        return undefined;
      }
      if (this.placesAsked(wayspot)) {
        await this.wayspotLookups.remove([item]);
        this.places.changed(guildId);
        return undefined;
      }
      const point = { lat: wayspot.lat, lon: wayspot.lon };
      const answer = await geo.placesNear(point, placesRadius(this.nearestPlace(guildId, wayspot)));
      if (answer.ok || reachedGoogle(answer.reason)) await this.count('places', guildId);
      if (!answer.ok) {
        if (answer.reason === 'denied') {
          this.deniedForMs = answer.retryInMs ?? this.placesEveryMs;
          this.refusing = true;
          return this.deniedForMs;
        }
        if (answer.reason === 'no-key') return 'empty';
        return this.wayspotFailed(item);
      }
      await this.answers.save([
        {
          kind: 'places',
          ...point,
          answer: placesText(answer.value),
          askedAt: this.now(),
        },
      ]);
      saved = true;
      this.places.changed(guildId);
      // Moved or of another kind while Google was asked: it waits again, as it is now.
      const now = wayspots?.stored(guildId, id);
      const changed =
        now !== undefined &&
        (now.kind !== wayspot.kind || metresBetween(now, wayspot) > WAYSPOT_MOVED_METRES);
      if (!changed) await this.wayspotLookups.remove([item]);
      this.misses = 0;
      if (!(await this.lookups.any()) && !(await this.wayspotLookups.any())) return 'empty';
    } catch (err) {
      log.warn({ err, wayspot: id }, 'could not bring the places of a Wayspot up to date');
      // Answered and kept: no failed question, neither set aside nor put back in the line; the
      // line goes on after its pause.
      if (saved) return this.placesEveryMs;
      // Its answer could not be written (or the line not read): as a failed question.
      return this.wayspotFailed(item);
    }
    return undefined;
  }

  /**
   * A PokéStop or Power Spot whose turn did not answer: set aside until the next day
   * (`asideSpots`, by its id: every server's row of it, also when it is queued again meanwhile),
   * its row after the others of its kind until it is queued anew (`RETRY_RANK`), and the line
   * waits longer, as after a gym's. Never rejects.
   */
  private async wayspotFailed(item: WaitingWayspot): Promise<number> {
    this.asideSpots.add(item.wayspotId);
    this.misses++;
    try {
      const note = this.beforeWrite([{ guildId: item.guildId, address: false }]);
      await this.wayspotLookups.add(
        [{ ...item, rank: this.shareRank(item.guildId, false, RETRY_RANK) }],
        this.now(),
      );
      this.afterWrite(note);
    } catch (err) {
      this.options.log.warn(
        { err, wayspot: item.wayspotId },
        'could not put a Wayspot at the end of the line for Google',
      );
    }
    return Math.min(MAX_RETRY_WAIT_MS, this.placesEveryMs * 2 ** this.misses);
  }

  /**
   * How far the nearest gym, PokéStop or Power Spot of the server whose row asks (its own gyms
   * and rows: another server's copy of a place nearby never makes the circle tiny, as for a
   * gym's nearest gym) is from a Wayspot; undefined beyond 1 km.
   */
  private nearestPlace(
    guildId: number,
    wayspot: { id: string; lat: number; lon: number },
  ): number | undefined {
    let nearest: number | undefined;
    for (const gym of this.options.directory.gymsOf(guildId)) {
      if (Math.abs(gym.lat - wayspot.lat) > 0.01) continue;
      const metres = metresBetween(gym, wayspot);
      if (metres <= NEAREST_PLACE_METRES && (nearest === undefined || metres < nearest)) {
        nearest = metres;
      }
    }
    const other = this.options.wayspots
      ?.of(guildId)
      .near(wayspot, NEAREST_PLACE_METRES, ['stop', 'powerspot', 'gym'])
      .find((near) => near.wayspot.id !== wayspot.id);
    if (other && (nearest === undefined || other.metres < nearest)) nearest = other.metres;
    return nearest;
  }

  /** Runs work nobody waits for; what it throws is logged. Nothing is started after `stop`. */
  private aside(run: () => Promise<unknown>): void {
    if (this.stopped) return;
    const work: Promise<unknown> = run()
      .catch((err: unknown) => {
        this.options.log.warn({ err }, 'the upkeep of a gym failed');
      })
      .finally(() => this.running.delete(work));
    this.running.add(work);
  }

  /**
   * Does everything that waits, now, without the pauses of the line, and waits for it; the gyms
   * that wait for an API that is denied, or for the next day, keep waiting. For tests.
   */
  async flush(): Promise<void> {
    for (;;) {
      this.cancelTimer?.();
      this.cancelTimer = undefined;
      // A denied API or the day's limit ends it: the gyms stay in the line.
      let next: number | 'empty' | undefined;
      do next = await this.next();
      while (next === undefined);
      if (this.running.size === 0) return;
      await Promise.allSettled([...this.running]);
    }
  }

  /**
   * For shutdown: starts nothing more and waits for what is on its way (a write must finish
   * before the database closes). The line stays in the database for the next start.
   */
  async stop(): Promise<void> {
    this.stopped = true;
    this.cancelTimer?.();
    this.cancelTimer = undefined;
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
  }
}
