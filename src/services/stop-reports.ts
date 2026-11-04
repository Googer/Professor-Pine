import { BoundedMap } from '../bounded-map.js';
import type { ReportPlace, StopReportStorage } from '../db/repositories/stop-report-repository.js';
import { isHideout, parseRocketKey } from '../domain/rocket/lineups.js';
import {
  decideResearch,
  versionOf,
  type ResearchAt,
  type ResearchDecision,
  type ResearchSubjectKey,
  type StandingResearch,
} from '../domain/research/reports.js';
import type { TaskReward } from '../domain/research/task.js';
import { decideRocket, rocketDay, type RocketDecision } from '../domain/rocket/reports.js';
import {
  reportCell,
  researchFate,
  rocketFate,
  type TakeBackBy,
} from '../domain/stops/report-history.js';
import {
  isResearchReport,
  isRocketReport,
  type Reporter,
  type ReportedStop,
  type ResearchDetail,
  type ResearchReport,
  type RocketDetail,
  type RocketReport,
  type StopReport,
} from '../domain/stops/report.js';
import { localDayStart } from '../domain/time/local-day.js';
import { periodAt, type ResearchPeriod } from '../domain/time/research-periods.js';
import type { Logger } from '../log.js';
import type { ResearchEventProvider } from './raid-event-service.js';
import { regionsAtPoint } from './region-directory.js';

/** What a research report is of: its subject (a task's key, `typed:<key>`) and what it says. */
export interface ResearchSubject {
  subjectKey: string;
  research: ResearchDetail;
}

/** A research report saved at one stop: it, and the research report there it replaced. */
export interface SavedAtStop {
  report: ResearchReport;
  replaced: ResearchReport | undefined;
}

/**
 * What came of a research report at one or more stops (plan 8R-5, R8): each stop is saved, or
 * reported already (the same version stands, or one that says more: `decideResearch`), or asks
 * (another's report stands that it contradicts, and the member did not say to replace it, R7).
 */
export interface ResearchOutcome {
  period: ResearchPeriod;
  /** One per stop saved, in the order given. */
  saved: SavedAtStop[];
  /** The reports standing at the stops reported already, in the order given. */
  already: ResearchReport[];
  /** The reports standing at the stops that ask first, in the order given. */
  asks: ResearchReport[];
}

/**
 * Reports at stops that are news to members who want what they reward (plan 8R-1; design 7):
 * those whose stop had no report of the same subject in the period before (a report of the same
 * task again is no news), with the period and who reported; and (plan 8R-5) the reports they
 * replaced, so that the notifier tells a narrowing of a "one of" from a first report.
 */
export interface ResearchNews {
  serverId: string;
  reports: ResearchReport[];
  reporter: Reporter;
  period: ResearchPeriod;
  replaced: ResearchReport[];
}

/** What a Rocket report is of (plan 8R-2): who (`rocketKey`) and what it says. */
export interface RocketSubject {
  subjectKey: string;
  rocket: RocketDetail;
}

/**
 * What came of a Rocket report (plan 8R-2; design 5.2, Matt's answer 4): reported (in the place
 * of the stop's Rocket report of the day, if any, `replaced` only while that one stood; `news`
 * unless it is the same hideout again); refined (plan 8R-4L, Matt's B2: a lineup of the grunt
 * type that stood, over "not sure which" or the other lineup: that report changed in place, its
 * id kept, nothing ended; always news, the hour per type keeps a second DM away);
 * or not: the same grunt stands (`already`), or a hideout does and the member is asked (`asks`).
 */
export type RocketOutcome =
  | { kind: 'reported'; report: RocketReport; replaced: RocketReport | undefined; news: boolean }
  | { kind: 'refined'; report: RocketReport; replaced: RocketReport }
  | { kind: 'already'; standing: RocketReport }
  | { kind: 'asks'; standing: RocketReport };

/** Who hears of reports as they come and go. */
export interface StopReportListener {
  /**
   * Reports were made or taken back in a server, at these stops (and where a report replaced
   * another, that one's stop too): the posts of the stops of the regions they lie in are drawn anew.
   * Not told of grunts, which no post shows.
   */
  changed?(serverId: string, stops: readonly ReportedStop[]): void;
  /** Research reports that are news (`ResearchNews`). */
  reported?(news: ResearchNews): void;
  /**
   * A hideout (a leader, Giovanni, the decoy) was reported (plan 8R-9: the region channels' lines
   * of new leaders), also the same one again; not one put back (`restore`).
   */
  hideoutReported?(report: RocketReport): void;
  /**
   * Reports that ended before their time (plan 8R-2): taken back, or replaced while they stood.
   * A grunt's message goes with it.
   */
  ended?(reports: readonly StopReport[]): void;
  /**
   * What `/api/stop-reports` shows of a server may have changed: a report made, refined in place,
   * taken back or put back, grunts too, or a link it shows (`linksChanged`). Not `changed`, which
   * is not told of grunts and whose meaning the posts of the stops rely on.
   */
  listChanged?(serverId: string): void;
}

/** What came of taking reports back. */
export interface TakenBack {
  removed: StopReport[];
  /** Another member's, which only staff may take back. */
  notYours: StopReport[];
  /**
   * Changed in place since the version asked for (review L1: another `madeAt` under the same
   * id), as they stand now: nothing of them is taken back, by staff or anyone.
   */
  changed: StopReport[];
}

/**
 * A report to take back: by its id, or by its version (review L1), its id and when it was made,
 * which a Rocket report refined in place (plan 8R-4L) no longer is.
 */
export type ReportRef = number | { id: number; madeAt: number };

/**
 * Where a member last reported at a stop (`StopReportService.latestToday`): the stop's place, and
 * when the report was made.
 */
export interface LastReport {
  lat: number;
  lon: number;
  madeAt: number;
}

/** How long a grunt stands unless said (`settings.rocket.gruntMinutes`). */
const GRUNT_MS = 30 * 60_000;

/**
 * How many members' last reports are kept in memory (`latestToday`), over every server: more
 * than report at stops in a day on a big instance; one forgotten falls back to the table.
 */
const LAST_REPORTS = 5_000;

export interface StopReportServiceOptions {
  store: StopReportStorage;
  /** The events with field research (`researchEvents`), whose periods a report belongs to. */
  events: ResearchEventProvider;
  /** `settings.timezone`. */
  zone: string;
  log: Logger;
  now?: () => number;
  /** How long a grunt's report stands (`settings.rocket.gruntMinutes`). Default 30 minutes. */
  gruntMs?: number;
  /**
   * A research reward's hash (`rewardHash` with the game data's catalogue, which tells a costume:
   * plan 8R-5), by which a "one of" is found to hold a reward. Required (review L5): without the
   * catalogue no reward is costumed, and a costumed reward over its "one of" would ask.
   */
  rewardHash: (reward: TaskReward) => string;
  /**
   * The server's row by its snowflake, and the regions as the directory holds them (plan 8H-2):
   * the regions whose outlines hold a report's stop are kept with it when it is made, and in its
   * record when it ends, found as `RocketService.channelsAt`, the notifier and the map find them
   * (`regionsAtPoint`). Asked before the save, outside its transaction; a lookup that fails is
   * logged and the report kept with its regions unknown (null). Neither given: unknown.
   */
  guilds?: { idFor(snowflake: string): Promise<number | undefined> };
  regions?: {
    all(): readonly {
      id: number;
      guildId: number | null;
      channelId: string;
      bounds: readonly { lat: number; lon: number }[] | null;
    }[];
  };
}

/**
 * Reports at stops (plan 8R-1; design 1–4): field research by task at one to five stops, each
 * in the place of the stop's report of the period, whoever made it (`StopReportStorage.save`).
 * A report belongs to the research period that was on when it was made (`periodAt` of the
 * stored events: design 9.2) and ends with it. Team GO Rocket (plan 8R-2; design 5.2): one
 * report per stop and day, a grunt for `gruntMs`, a hideout until midnight, decided with the
 * stop's row locked (`decideRocket` in `saveUnless`). Listeners hear of every change (the pinned
 * posts), of the research that is news (the notifier) and of the reports that ended early (the
 * grunts' messages). Taking back is the reporter's, or staff's. The hourly upkeep forgets what
 * has ended (`sweep`). Where each member last reported is recorded in memory (`latestToday`).
 */
export class StopReportService {
  private readonly now: () => number;
  private readonly gruntMs: number;
  private readonly listeners: StopReportListener[] = [];
  /**
   * Where each member last reported, by server and member (review R2: a record of the member's
   * own, which another member replacing or refining that report does not touch).
   */
  private readonly lastReports = new BoundedMap<string, LastReport>(LAST_REPORTS);

  private readonly rewardHash: (reward: TaskReward) => string;

  constructor(private readonly options: StopReportServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.gruntMs = options.gruntMs ?? GRUNT_MS;
    this.rewardHash = options.rewardHash;
  }

  /** What `decideResearch` reads of a research subject: its key and its rewards' hashes. */
  private researchAt(subject: {
    subjectKey: string;
    research: Pick<ResearchDetail, 'rewards'>;
  }): ResearchAt {
    return {
      subjectKey: subject.subjectKey,
      hashes: subject.research.rewards.map((reward) => this.rewardHash(reward)),
    };
  }

  /**
   * A research report's version as the decision sees it (`versionOf`; review R2: the pinned
   * post groups by it): its task, and its reward's hash where it stands for one reward, also
   * a report of before plan 8R-5 of a task of one reward (R10).
   */
  versionOf(report: {
    subjectKey: string;
    research: Pick<ResearchDetail, 'rewards'>;
  }): ResearchSubjectKey | undefined {
    return versionOf(this.researchAt(report));
  }

  /** What `decideResearch` reads of the research report standing at a stop. */
  private standingResearch(report: ResearchReport): StandingResearch {
    return {
      ...this.researchAt(report),
      id: report.id,
      endsAt: report.endsAt,
      reporterId: report.reporter.id,
    };
  }

  /**
   * The reports a research report would contradict at these stops, of the period on now (R7,
   * R15): another member's that it neither narrows, nor says less than, nor repeats. Read without
   * a lock, so that a member is asked before anything is reported; `reportResearch` decides
   * again with each stop's row locked.
   */
  async contested(
    serverId: string,
    stops: readonly ReportedStop[],
    subject: ResearchSubject,
    by: string,
  ): Promise<ResearchReport[]> {
    const now = this.now();
    const period = this.period(now);
    const standing = (await this.standing(serverId))
      .filter(isResearchReport)
      .filter((report) => report.periodKey === period.key);
    const asked = this.researchAt(subject);
    return stops.flatMap((stop) => {
      const there = standing.find((report) => report.stop.key === stop.key);
      return there && decideResearch(this.standingResearch(there), asked, now, by) === 'asks'
        ? [there]
        : [];
    });
  }

  /**
   * Where a report at a stop is kept to have been (plan 8H-2): its S2 cell (`reportCell`) and the
   * ids of the server's regions that hold it now (none, `[]`, for a stop in no region or a
   * server without a row), or null for them where they cannot be read (logged: the report goes
   * on without them, review H11).
   */
  private async placeOf(serverId: string, stop: ReportedStop): Promise<ReportPlace> {
    const cell = reportCell(stop);
    const { guilds, regions } = this.options;
    if (!guilds || !regions) return { cell, regionIds: null };
    try {
      const row = await guilds.idFor(serverId);
      if (row === undefined) return { cell, regionIds: [] };
      return { cell, regionIds: regionsAtPoint(regions.all(), row, stop).map(({ id }) => id) };
    } catch (err) {
      this.options.log.warn(
        { err, guild: serverId, stop: stop.key },
        'could not find the regions of a stop',
      );
      return { cell, regionIds: null };
    }
  }

  /** Adds a listener; it must not throw (what it throws is logged). */
  listen(listener: StopReportListener): void {
    this.listeners.push(listener);
  }

  /** The research period on now (or at `at`). */
  period(at = this.now()): ResearchPeriod {
    return periodAt(this.options.events.researchEvents(), at, this.options.zone);
  }

  /** The reports of a server that have not ended, oldest first. */
  standing(serverId: string): Promise<StopReport[]> {
    return this.options.store.standing(serverId, this.now());
  }

  /**
   * Where the member last reported in a server today (the local day in the settings' zone),
   * research or Team GO Rocket, from any path, as this process recorded it when the report was
   * saved: also where that report has ended, been swept, taken back by staff, or replaced or
   * refined by another member since (Matt, 2026-10-27, "Last today"; review R2: `/rocket report`
   * offers the stops near it). Without a record of today (a restart emptied it, it was forgotten,
   * or the member took that report back, review S1), the member's latest report of today the
   * table still keeps (standing, or ended and not yet swept).
   */
  async latestToday(serverId: string, memberId: string): Promise<LastReport | undefined> {
    const since = localDayStart(this.now(), this.options.zone);
    const recorded = this.lastReports.get(lastReportKey(serverId, memberId));
    if (recorded && recorded.madeAt >= since) return recorded;
    const kept = await this.options.store.latestBy(serverId, memberId, since);
    return kept && { lat: kept.stop.lat, lon: kept.stop.lon, madeAt: kept.madeAt };
  }

  /** Records where a member reported (`latestToday`), unless a later report is recorded. */
  private recordReport(serverId: string, memberId: string, stop: ReportedStop, madeAt: number) {
    const key = lastReportKey(serverId, memberId);
    const recorded = this.lastReports.get(key);
    if (recorded && recorded.madeAt > madeAt) return;
    this.lastReports.set(key, { lat: stop.lat, lon: stop.lon, madeAt });
  }

  /**
   * Forgets a member's recorded last report where it is the one they took back (review S1: a
   * wrong stop taken back does not anchor the rest of the day): `latestToday` reads the table
   * again, as after a restart.
   */
  private forgetReport(serverId: string, memberId: string, madeAt: number) {
    const key = lastReportKey(serverId, memberId);
    if (this.lastReports.get(key)?.madeAt === madeAt) this.lastReports.delete(key);
  }

  /** A report by its id, of a server, if it has not ended. */
  async get(serverId: string, id: number): Promise<StopReport | undefined> {
    const report = await this.options.store.byId(id);
    return report?.serverId === serverId && report.endsAt > this.now() ? report : undefined;
  }

  /**
   * A report of a server by its id as it is kept now: neither replaced nor taken back, ended by
   * its time or not (until the upkeep forgets it). A Rocket report refined in place (plan 8R-4L)
   * is kept under its id with another `madeAt` (review L1): the caller compares.
   */
  async kept(serverId: string, id: number): Promise<StopReport | undefined> {
    const report = await this.options.store.byId(id);
    return report?.serverId === serverId ? report : undefined;
  }

  /**
   * The research report a member means at a stop: of the period on now, else of the one waiting
   * under it (an intra-day event's window); undefined when the stop has neither.
   */
  async at(serverId: string, stopKey: string): Promise<ResearchReport | undefined> {
    const period = this.period();
    const here = (await this.standing(serverId))
      .filter(isResearchReport)
      .filter((report) => report.stop.key === stopKey);
    return (
      here.find((report) => report.periodKey === period.key) ??
      here.find((report) => report.periodKey === period.waiting?.key)
    );
  }

  /** The Rocket report standing at a stop (plan 8R-2), the latest where two do (past midnight). */
  async rocketAt(serverId: string, stopKey: string): Promise<RocketReport | undefined> {
    return (await this.standing(serverId))
      .filter(isRocketReport)
      .filter((report) => report.stop.key === stopKey)
      .at(-1);
  }

  /**
   * Reports a version of a task at these stops (one to five, each once) in the period on now:
   * each as `decideResearch` decides with the stop's row locked (`saveUnless`; plan 8R-5, R8): in
   * the place of the stop's report of the period where it narrows it, contradicts the member's
   * own, or one the member said to replace (`replacing`, R7); reported already where the same
   * version stands or one that says more; asking where it contradicts another's report. Throws
   * what storing throws; a stop stored before the failure stays reported (each is a transaction
   * of its own).
   */
  async reportResearch(input: {
    serverId: string;
    stops: readonly ReportedStop[];
    subject: ResearchSubject;
    reporter: Reporter;
    replacing?: readonly number[];
  }): Promise<ResearchOutcome> {
    const madeAt = this.now();
    const period = this.period(madeAt);
    const saved: SavedAtStop[] = [];
    const already: ResearchReport[] = [];
    const asks: ResearchReport[] = [];
    const asked = this.researchAt(input.subject);
    // Where each stop lies, before any save and outside its transaction (plan 8H-2).
    const places = await Promise.all(input.stops.map((stop) => this.placeOf(input.serverId, stop)));
    try {
      for (const [n, stop] of input.stops.entries()) {
        // Set by the decision inside the transaction (an object: a closure's write is not narrowed).
        const decided: { decision: ResearchDecision } = { decision: 'new' };
        const outcome = await this.options.store.saveUnless(
          {
            serverId: input.serverId,
            kind: 'research',
            stop,
            periodKey: period.key,
            endsAt: period.end,
            subjectKey: input.subject.subjectKey,
            research: input.subject.research,
            reporter: input.reporter,
            madeAt,
          },
          (standing) => {
            if (!isResearchReport(standing)) return 'replace';
            decided.decision = decideResearch(
              this.standingResearch(standing),
              asked,
              madeAt,
              input.reporter.id,
              input.replacing,
            );
            // How the standing report ends, and whether this one confirms it (plan 8H-2).
            const fate = researchFate(decided.decision, standing.reporter.id, input.reporter.id);
            switch (decided.decision) {
              case 'less':
              case 'again':
              case 'asks':
                return { verdict: 'keep', ...fate };
              case 'new':
              case 'narrow':
              case 'correct':
                return { verdict: 'replace', ...fate };
            }
          },
          places[n] === undefined ? {} : { place: places[n] },
        );
        if (!outcome.saved) {
          const { standing } = outcome;
          if (!isResearchReport(standing)) throw new Error('a research report met another kind');
          (decided.decision === 'asks' ? asks : already).push(standing);
          continue;
        }
        const { report, replaced } = outcome;
        // A report replaces only one of its own kind (the identity has the kind).
        if (!isResearchReport(report)) throw new Error('a research report was saved as another');
        // A row that had ended already replaced nothing a member saw, and is not named (review
        // R1, as Rocket's fix F2): the report is news, a first one.
        saved.push({
          report,
          replaced:
            replaced && isResearchReport(replaced) && replaced.endsAt > madeAt
              ? replaced
              : undefined,
        });
      }
    } finally {
      const last = saved.at(-1);
      if (last) {
        // Where the member was last: the last stop saved, as the table's later id would say.
        this.recordReport(input.serverId, input.reporter.id, last.report.stop, last.report.madeAt);
        const stops = saved.flatMap(({ report, replaced }) =>
          replaced ? [report.stop, replaced.stop] : [report.stop],
        );
        this.tell((listener) => listener.changed?.(input.serverId, stops));
        this.linksChanged(input.serverId);
      }
    }
    // A stop that had this very task reported in the period is no news (design 7).
    const news = saved.filter(({ replaced }) => replaced?.subjectKey !== input.subject.subjectKey);
    if (news.length > 0) {
      this.tell((listener) =>
        listener.reported?.({
          serverId: input.serverId,
          reports: news.map(({ report }) => report),
          reporter: input.reporter,
          period,
          replaced: news.flatMap(({ replaced }) => (replaced ? [replaced] : [])),
        }),
      );
    }
    this.options.log.info(
      {
        guild: input.serverId,
        by: input.reporter.id,
        stops: saved.length,
        replaced: saved.filter(({ replaced }) => replaced !== undefined).length,
        already: already.length,
        asks: asks.length,
        period: period.key,
      },
      'field research reported',
    );
    return { period, saved, already, asks };
  }

  /**
   * Reports Team GO Rocket at a stop (plan 8R-2; design 5.2): in the place of the stop's Rocket
   * report of the day as `decideRocket` decides, inside the transaction that holds the stop's row
   * (`saveUnless`): the same grunt standing is reported already; a grunt where a hideout stands
   * asks first, unless `replacing` is that hideout's id (the member said Replace). A grunt stands
   * `gruntMs`, a hideout until local midnight. What it replaced while it stood has ended
   * (`ended`); a hideout made or replaced changes the posts (`changed`). The same hideout again
   * is no news. A lineup of the grunt type that stands refines it in place (`refined`, plan
   * 8R-4L): nothing ends and no post changes. Throws what storing throws.
   */
  async reportRocket(input: {
    serverId: string;
    stop: ReportedStop;
    subject: RocketSubject;
    reporter: Reporter;
    replacing?: number;
  }): Promise<RocketOutcome> {
    const who = parseRocketKey(input.subject.subjectKey);
    if (!who) throw new Error(`no Rocket report is of ${input.subject.subjectKey}`);
    const madeAt = this.now();
    const day = rocketDay(madeAt, this.options.zone);
    const hideout = isHideout(who);
    // Where the stop lies, before the save and outside its transaction (plan 8H-2).
    const place = await this.placeOf(input.serverId, input.stop);
    // Set by the decision inside the transaction (an object: a closure's write is not narrowed).
    const asked: { decision: RocketDecision } = { decision: 'report' };
    const outcome = await this.options.store.saveUnless(
      {
        serverId: input.serverId,
        kind: 'rocket',
        stop: input.stop,
        periodKey: day.key,
        endsAt: hideout ? day.end : madeAt + this.gruntMs,
        subjectKey: input.subject.subjectKey,
        rocket: input.subject.rocket,
        reporter: input.reporter,
        madeAt,
      },
      (standing) => {
        asked.decision = decideRocket(standing, input.subject, madeAt, input.replacing);
        // How the standing report ends, and whether this one confirms it (plan 8H-2).
        const fate = rocketFate(asked.decision, standing.reporter.id, input.reporter.id);
        switch (asked.decision) {
          case 'already':
          case 'asks':
            return { verdict: 'keep', ...fate };
          case 'refine':
            return { verdict: 'update', ...fate };
          case 'report':
            return { verdict: 'replace', ...fate };
        }
      },
      // What still stands at the stop, also from yesterday past midnight (fix A2).
      { standingAt: madeAt, place },
    );
    if (!outcome.saved) {
      const { standing } = outcome;
      if (!isRocketReport(standing)) throw new Error('a Rocket report met another kind');
      return asked.decision === 'already'
        ? { kind: 'already', standing }
        : { kind: 'asks', standing };
    }
    const { report } = outcome;
    if (!isRocketReport(report)) throw new Error('a Rocket report was saved as another');
    // The row's time (review S3): a refine in place is written after the report it refines.
    this.recordReport(input.serverId, input.reporter.id, report.stop, report.madeAt);
    this.linksChanged(input.serverId);
    const replaced =
      outcome.replaced && isRocketReport(outcome.replaced) ? outcome.replaced : undefined;
    if (outcome.inPlace && replaced) {
      // Refined in place (plan 8R-4L): nothing ended, no post shows a grunt.
      this.options.log.info(
        {
          guild: input.serverId,
          by: input.reporter.id,
          who: input.subject.subjectKey,
          refined: replaced.subjectKey,
          report: report.id,
        },
        'Team GO Rocket refined',
      );
      return { kind: 'refined', report, replaced };
    }
    // What stood until now ended early: a grunt's message goes with it. A row that had ended
    // already replaced nothing a member saw, and is not named (fix F2).
    const stood = replaced !== undefined && replaced.endsAt > madeAt ? replaced : undefined;
    if (stood) this.tell((listener) => listener.ended?.([stood]));
    const wasHideout = stood !== undefined && isHideoutReport(stood);
    if (hideout || wasHideout) {
      const stops = stood ? [report.stop, stood.stop] : [report.stop];
      this.tell((listener) => listener.changed?.(input.serverId, stops));
    }
    if (hideout) this.tell((listener) => listener.hideoutReported?.(report));
    this.options.log.info(
      {
        guild: input.serverId,
        by: input.reporter.id,
        who: input.subject.subjectKey,
        replaced: stood?.subjectKey,
      },
      'Team GO Rocket reported',
    );
    return {
      kind: 'reported',
      report,
      replaced: stood,
      news: stood?.subjectKey !== report.subjectKey,
    };
  }

  /**
   * Takes back reports of a server by their ids or versions (`ReportRef`): those of `by` as a
   * `member`, any one as `staff` or as Pine undoing a grunt that shows nowhere (`unposted`); one
   * gone or ended already is passed over. Each is recorded (plan 8H-2, review H8): `withdrawn`
   * where it was `by`'s own, `staff` where it was another's, `unposted` for Pine's undo. A replaced report does not
   * come back (design 9.13). One asked for by a version it no longer is (refined in place since,
   * review L1) is `changed`, before whose it is: its first reporter is told it changed, not that
   * it is another's. A member who takes back their latest report has it forgotten as where they
   * last reported (`forgetReport`, review S1); staff taking back another's leave that record.
   */
  async takeBack(
    serverId: string,
    refs: readonly ReportRef[],
    by: string,
    as: TakeBackBy,
  ): Promise<TakenBack> {
    const removed: StopReport[] = [];
    const notYours: StopReport[] = [];
    const changed: StopReport[] = [];
    for (const ref of refs) {
      const { id, madeAt } = typeof ref === 'number' ? { id: ref, madeAt: undefined } : ref;
      const report = await this.get(serverId, id);
      if (!report) continue;
      if (madeAt !== undefined && report.madeAt !== madeAt) {
        changed.push(report);
        continue;
      }
      if (as === 'member' && report.reporter.id !== by) {
        notYours.push(report);
        continue;
      }
      // With its row locked the version is asked again: one refined meanwhile is kept.
      const gone = await this.options.store.remove(
        id,
        serverId,
        { by, as, at: this.now() },
        madeAt,
      );
      if (gone) {
        removed.push(gone);
        if (gone.reporter.id === by) this.forgetReport(serverId, by, gone.madeAt);
      } else if (madeAt !== undefined) {
        const now = await this.get(serverId, id);
        if (now) changed.push(now);
      }
    }
    if (removed.length > 0) {
      // Only research and hideouts are in the posts: a grunt taken back draws none (fix A4).
      const stops = removed
        .filter((report) => isResearchReport(report) || isHideoutReport(report))
        .map((report) => report.stop);
      if (stops.length > 0) this.tell((listener) => listener.changed?.(serverId, stops));
      this.tell((listener) => listener.ended?.(removed));
      this.linksChanged(serverId);
      this.options.log.info(
        { guild: serverId, by, as, reports: removed.map((report) => report.id) },
        'stop reports taken back',
      );
    }
    return { removed, notYours, changed };
  }

  /**
   * Puts a hideout back in the place of the grunt that replaced it, where that grunt could be
   * posted nowhere (fixes R2, S4): the same subject, reporter, day and end under a new id, the
   * grunt replaced in the same step (told as `ended`), unless the hideout's day has ended or
   * another report than the grunt stands at the stop by now (then nothing comes back, and the
   * caller takes the grunt back). The posts are drawn anew. Gives the report put back. The
   * hideout's record (written when the grunt took its place) is forgotten and the grunt is
   * recorded as `unposted`, in the same step (plan 8H-2, review H4): a hideout never counts twice.
   * It takes the cell and regions of that record (P4), and starts with no confirmations. Where
   * forgetting the record fails, the restore throws (P3), and the caller takes the grunt back.
   */
  async restore(hideout: RocketReport, grunt: RocketReport): Promise<RocketReport | undefined> {
    const now = this.now();
    if (hideout.endsAt <= now) return undefined;
    const { id: _id, ...again } = hideout;
    // In one step under the stop's lock (fix S4): the grunt's row becomes the hideout's, so there
    // is no moment without a report; another report standing there is kept.
    const outcome = await this.options.store.saveUnless(
      again,
      // The grunt as it was (review L1): one refined in place since keeps its id, not its time.
      (standing) =>
        standing.id === grunt.id && standing.madeAt === grunt.madeAt
          ? { verdict: 'replace', ending: 'unposted' }
          : 'keep',
      { standingAt: now, restoring: { id: hideout.id, madeAt: hideout.madeAt } },
    );
    if (!outcome.saved || !isRocketReport(outcome.report)) return undefined;
    const { report } = outcome;
    if (outcome.replaced) {
      const gone = outcome.replaced;
      this.tell((listener) => listener.ended?.([gone]));
    }
    this.tell((listener) => listener.changed?.(hideout.serverId, [report.stop]));
    this.linksChanged(hideout.serverId);
    this.options.log.info(
      { guild: hideout.serverId, report: report.id, who: report.subjectKey },
      'a hideout put back',
    );
    return report;
  }

  /**
   * A grunt overtaken while its messages went out (`RocketService`, fix F3; plan 8H-2, review
   * H4): seen by nobody, so its record ends `unposted`, whatever replaced or took it back. A
   * failure is logged: the record keeps the ending it had.
   */
  async overtaken(report: RocketReport): Promise<void> {
    try {
      await this.options.store.endedAs(report.id, report.madeAt, 'unposted');
    } catch (err) {
      this.options.log.warn(
        { err, report: report.id },
        'could not record an overtaken grunt as unposted',
      );
    }
  }

  /**
   * Tells `listChanged`: for what this service does itself, and for those who store what the map's
   * view shows of a report, a grunt's message (`RocketService`) and "Today's Stops" as drawn
   * (`StopPostService`).
   */
  linksChanged(serverId: string): void {
    this.tell((listener) => listener.listChanged?.(serverId));
  }

  /** Forgets the reports that have ended; gives how many (the hourly upkeep, and at start). */
  sweep(): Promise<number> {
    return this.options.store.removeEnded(this.now());
  }

  private tell(call: (listener: StopReportListener) => void): void {
    for (const listener of this.listeners) {
      try {
        call(listener);
      } catch (err) {
        this.options.log.error({ err }, 'a listener of the stop reports failed');
      }
    }
  }
}

/** The key of a member's last report in `StopReportService`'s record: server and member. */
function lastReportKey(serverId: string, memberId: string): string {
  return `${serverId}:${memberId}`;
}

/** Whether a Rocket report is of a hideout (a leader, Giovanni, the decoy). */
export function isHideoutReport(report: RocketReport): boolean {
  const who = parseRocketKey(report.subjectKey);
  return who !== undefined && isHideout(who);
}
