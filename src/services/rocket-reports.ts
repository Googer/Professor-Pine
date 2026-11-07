import type { Region } from '../db/repositories/region-repository.js';
import type { RocketChoice } from '../domain/rocket/lineups.js';
import {
  isRocketReport,
  type Reporter,
  type ReportedStop,
  type RocketReport,
} from '../domain/stops/report.js';
import type { Logger } from '../log.js';
import type { GruntMessageService, PostedGrunt } from './grunt-messages.js';
import { regionsAtPoint } from './region-directory.js';
import { isHideoutReport, type RocketSubject, type StopReportService } from './stop-reports.js';

/**
 * A Rocket report that is news to members who want it (plan 8R-2; design 7): the report, and
 * per region channel that holds its stop the grunt's message there (none for a hideout, which
 * the post of the stops shows, and none in rehearsal mode).
 */
export interface RocketNews {
  serverId: string;
  report: RocketReport;
  channels: { channelId: string; messageId: string | undefined }[];
  /**
   * Who else made it known and is not told (plan 8R-4L, review R3): the reporter of the grunt a
   * refine changed in place, whose report it was.
   */
  alsoActors?: string[];
  /**
   * The report it replaced while that stood (Matt, 2026-11-07): who was told of that one hears it
   * was replaced. Never what a refine changed in place, which keeps its id.
   */
  replaced?: RocketReport;
}

/** What came of a Rocket report, with what was posted. */
export type RocketReported =
  | {
      kind: 'reported';
      report: RocketReport;
      replaced: RocketReport | undefined;
      /** The region channels that hold the stop (its posts, its messages). */
      channels: string[];
      /** The grunt's messages (none for a hideout, or in rehearsal mode). */
      posted: PostedGrunt[];
      /** A grunt refined in place (plan 8R-4L): its messages were edited, not posted (8R-6). */
      changed?: true;
    }
  /** The same grunt stands (Matt's answer 4): its messages, for the answer's link. */
  | { kind: 'already'; standing: RocketReport; posted: PostedGrunt[] }
  /**
   * A grunt that could be posted in none of its region channels (all refused, or the bot was
   * shutting down): taken back, so that it stands in nobody's way unseen (fix A5).
   */
  | {
      kind: 'unposted';
      channels: string[];
      /** The hideout it had replaced, put back under a new id (fix R2). */
      restored?: RocketReport;
      /** The grunt it had replaced, which cannot come back: its message is gone (fix R2). */
      lost?: RocketReport;
    }
  /**
   * A grunt that ended while its messages were being posted (a newer report at the stop, or
   * taken back): nobody is told, its messages are deleted (fix F3). One refined in place
   * meanwhile that was posted nowhere is `unposted` (K1): the refine's turn takes it back.
   */
  | { kind: 'overtaken'; channels: string[] }
  /** A hideout stands today: the member is asked first (design 5.2). */
  | { kind: 'asks'; standing: RocketReport };

/**
 * What a choice of the lineups is reported as: its key, its name and catches as they are now; a
 * lineup (plan 8R-4L) its own catches and its first slot in short.
 */
export function rocketSubject(choice: RocketChoice): RocketSubject {
  return {
    subjectKey: choice.key,
    rocket: {
      name: choice.name,
      catches: choice.catches,
      ...(choice.lineup === undefined ? {} : { lineup: choice.lineup }),
    },
  };
}

export interface RocketServiceOptions {
  reports: Pick<
    StopReportService,
    | 'reportRocket'
    | 'takeBack'
    | 'restore'
    | 'kept'
    | 'linksChanged'
    | 'overtaken'
    | 'refinedUnseen'
  >;
  /** The grunts' messages; none in rehearsal mode, which posts nothing outside party posts. */
  messages: Pick<GruntMessageService, 'post' | 'refine' | 'messagesOf'> | undefined;
  regions: { all(): readonly Region[] };
  /** The row of a server in `Guild` (its regions name it so), by its snowflake. */
  guilds: { idFor(serverId: string): Promise<number | undefined> };
  /**
   * Told of every report that is news, once its messages are posted; and of a report that took
   * the place of another without being news (the same hideout again, a hideout put back), so that
   * who was told of the one is remembered as told of the other (Matt, 2026-11-07).
   */
  notify?: {
    rocketReported(news: RocketNews): void;
    rocketRenewed?(from: RocketReport, to: RocketReport): void;
  };
  log: Logger;
}

/**
 * Reporting Team GO Rocket (plan 8R-2; design 5.2), the one way to it for `/rocket` (and the map
 * of plan 8R-3): the report decided and kept (`StopReportService.reportRocket`), then a grunt's
 * message posted in each region channel whose outline holds the stop (`GruntMessageService`;
 * none in rehearsal mode), then the notifier told, so that a DM can link to the message.
 */
export class RocketService {
  constructor(private readonly options: RocketServiceOptions) {}

  /** The region channels of a server whose outlines hold a stop. */
  async channelsAt(serverId: string, stop: Pick<ReportedStop, 'lat' | 'lon'>): Promise<string[]> {
    const row = await this.options.guilds.idFor(serverId);
    if (row === undefined) return [];
    return regionsAtPoint(this.options.regions.all(), row, stop).map((region) => region.channelId);
  }

  /**
   * Reports who of Team GO Rocket a member met at a stop (`replacing`: the hideout the member said
   * Replace to). Throws only what finding the stop's region channels throws, before anything is
   * stored (L-1), and what storing throws, before anything is posted (fix A1): a region
   * channel where the message fails is passed over (`GruntMessageService.post` never rejects) and
   * the notifier is told of the channels it was posted in (all of them only in rehearsal mode and
   * for a hideout; fix R3). Outside rehearsal mode a grunt posted in none of the region channels
   * of its stop is taken back (`unposted`, fix A5): unseen, it would only answer "Already
   * reported" without a link for half an hour; a hideout it replaced is put back, a grunt it
   * replaced is named as lost (fix R2).
   */
  async report(input: {
    serverId: string;
    stop: ReportedStop;
    subject: RocketSubject;
    reporter: Reporter;
    replacing?: number;
  }): Promise<RocketReported> {
    const { messages, log } = this.options;
    // The stop's region channels first (L-1): one that cannot be found stores nothing, and no
    // await comes between the stored outcome and the queueing of its posting's or refine's turn,
    // so that a refine stored after it cannot take its turn before the posting.
    const channels = await this.channelsAt(input.serverId, input.stop);
    const outcome = await this.options.reports.reportRocket(input);
    if (outcome.kind === 'asks') return outcome;
    if (outcome.kind === 'already') {
      const posted = await (messages?.messagesOf(outcome.standing.id) ?? Promise.resolve([])).catch(
        (err: unknown) => {
          log.warn({ err, report: outcome.standing.id }, 'could not find a grunt’s messages');
          return [];
        },
      );
      return { ...outcome, posted };
    }
    if (outcome.kind === 'refined') return this.refined(outcome, channels);
    const { report } = outcome;
    const grunt = !isHideoutReport(report);
    const posted = grunt && messages ? await messages.post(report, channels) : [];
    // The messages are stored by now: the map's view links them.
    if (posted.length > 0) this.options.reports.linksChanged(input.serverId);
    if (grunt && messages) {
      const now = await this.asNow(report);
      // Replaced or taken back while it was posted: its messages go, and nobody is told; nobody
      // saw it, which its record says (plan 8H-2).
      if (!now) {
        await this.options.reports.overtaken(report);
        return { kind: 'overtaken', channels };
      }
      // Refined meanwhile (review R2): the refine edits the messages and tells. The member is
      // answered with the report as it stands, unless it was posted nowhere (F9, K1): then the
      // refine's turn finds no message either and takes it back, so the member's grunt is
      // `unposted` (nothing newer stands); a hideout it replaced comes back in the place of the
      // refined version, whose undo then finds it gone.
      if (now !== report) {
        if (channels.length > 0 && posted.length === 0) {
          // The version refined was seen by nobody either (8H2-1).
          await this.options.reports.refinedUnseen(report);
          return { kind: 'unposted', channels, ...(await this.undoRefined(now, outcome.replaced)) };
        }
        return { kind: 'reported', report: now, replaced: outcome.replaced, channels, posted };
      }
    }
    if (grunt && messages && channels.length > 0 && posted.length === 0) {
      return { kind: 'unposted', channels, ...(await this.undo(report, outcome.replaced)) };
    }
    // Outside rehearsal mode a grunt's DMs name the channels it was posted in (fix R3).
    const told = grunt && messages ? posted.map((one) => one.channelId) : channels;
    if (outcome.news) this.tell(report, told, posted, [], outcome.replaced);
    else if (outcome.replaced) this.renewed(outcome.replaced, report);
    return { kind: 'reported', report, replaced: outcome.replaced, channels, posted };
  }

  /**
   * A grunt refined in place (plan 8R-4L, Matt's B2): its messages edited (their ids kept, so
   * every DM's "Go to report" still finds them), then the notifier told as of a new report; the
   * hour per grunt type keeps a second DM from anyone told of the type already. Answered as a
   * report, `replaced` what it refined. Nothing to take back where the edits fail: the messages
   * stand as they were. Where its messages could not be read (L-5), it is told by the stop's
   * region channels without links, and they keep their old end.
   */
  private async refined(
    outcome: { report: RocketReport; replaced: RocketReport },
    channels: string[],
  ): Promise<RocketReported> {
    const { messages } = this.options;
    const { report, replaced } = outcome;
    const edited = messages ? await messages.refine(report) : undefined;
    const posted = edited?.standing ?? [];
    if (messages) {
      const now = await this.asNow(report);
      if (!now) {
        await this.options.reports.overtaken(report);
        return { kind: 'overtaken', channels };
      }
      // Refined again meanwhile (review R2): that refine tells.
      if (now !== report) {
        return { kind: 'reported', report: now, replaced, channels, posted, changed: true };
      }
      // Its messages all found gone (review R5): unseen, it is taken back as a grunt posted
      // nowhere is, and what it refined is lost with it. Where the refine could not tell (F2:
      // its messages could not be read, or it stopped on the way), it is told with what stands.
      if (edited?.complete === true && channels.length > 0 && posted.length === 0) {
        return { kind: 'unposted', channels, ...(await this.undo(report, replaced)) };
      }
    }
    // The reporter of what it refined is not told of their own grunt (review R3).
    const alsoActors = replaced.reporter.id === report.reporter.id ? [] : [replaced.reporter.id];
    // Its messages unread (L-5): told by the stop's region channels without links, as rehearsal
    // mode tells, so that Shadow wanters of the new lineup still hear.
    const byChannels = !messages || edited?.unread === true;
    this.tell(
      report,
      byChannels ? channels : posted.map((one) => one.channelId),
      posted,
      alsoActors,
    );
    return { kind: 'reported', report, replaced, channels, posted, changed: true };
  }

  /** Tells the notifier of a report in these channels, with its messages there. */
  private tell(
    report: RocketReport,
    channels: readonly string[],
    posted: PostedGrunt[],
    alsoActors: string[] = [],
    replaced?: RocketReport,
  ): void {
    try {
      this.options.notify?.rocketReported({
        serverId: report.serverId,
        report,
        channels: channels.map((channelId) => ({
          channelId,
          messageId: posted.find((one) => one.channelId === channelId)?.messageId,
        })),
        ...(alsoActors.length === 0 ? {} : { alsoActors }),
        ...(replaced === undefined ? {} : { replaced }),
      });
    } catch (err) {
      this.options.log.error({ err, guild: report.serverId }, 'could not tell of a Rocket report');
    }
  }

  /**
   * Tells the notifier that a report took the place of another without news (the same hideout
   * again, a hideout put back): who was told of the one counts as told of the other.
   */
  private renewed(from: RocketReport, to: RocketReport): void {
    try {
      this.options.notify?.rocketRenewed?.(from, to);
    } catch (err) {
      this.options.log.error({ err, guild: to.serverId }, 'could not tell of a Rocket report');
    }
  }

  /**
   * Undoes a grunt that shows nowhere (fix R2): takes it back, and puts back a hideout it replaced
   * while that stood; a grunt it replaced cannot come back (its message was deleted), and is
   * named as lost.
   */
  private async undo(
    report: RocketReport,
    replaced: RocketReport | undefined,
  ): Promise<{ restored?: RocketReport; lost?: RocketReport }> {
    if (replaced && replaced.endsAt > report.madeAt && isHideoutReport(replaced)) {
      // The hideout takes the grunt's place in one step (fix S4).
      try {
        const restored = await this.options.reports.restore(replaced, report);
        if (restored) {
          this.renewed(replaced, restored);
          return { restored };
        }
      } catch (err) {
        this.options.log.warn({ err, report: replaced.id }, 'could not put a hideout back');
      }
      await this.takeBack(report);
      return {};
    }
    await this.takeBack(report);
    if (!replaced || replaced.endsAt <= report.madeAt) return {};
    return { lost: replaced };
  }

  /**
   * What a grunt posted nowhere and refined meanwhile replaced (K1): the refine's turn takes the
   * refined version back, so nothing is taken back here; a hideout comes back in that version's
   * place (`restore` asks for it by its id and `madeAt`), a grunt cannot come back and is named.
   */
  private async undoRefined(
    refined: RocketReport,
    replaced: RocketReport | undefined,
  ): Promise<{ restored?: RocketReport; lost?: RocketReport }> {
    // `replaced` stood when the grunt was reported (`reportRocket` names nothing else).
    if (!replaced) return {};
    if (!isHideoutReport(replaced)) return { lost: replaced };
    try {
      const restored = await this.options.reports.restore(replaced, refined);
      if (restored) {
        this.renewed(replaced, restored);
        return { restored };
      }
    } catch (err) {
      this.options.log.warn({ err, report: replaced.id }, 'could not put a hideout back');
    }
    return {};
  }

  /**
   * A report as it is kept now, read anew after its messages were posted or edited (fix F3):
   * undefined where it is no longer kept (replaced or taken back); `report` itself while it is
   * kept unchanged, its id and `madeAt` (review L1); the report as it stands where it was
   * refined in place since. One that cannot be read is taken as kept (the failure is logged).
   */
  private async asNow(report: RocketReport): Promise<RocketReport | undefined> {
    try {
      const kept = await this.options.reports.kept(report.serverId, report.id);
      if (!kept || !isRocketReport(kept)) return undefined;
      return kept.madeAt === report.madeAt ? report : kept;
    } catch (err) {
      this.options.log.warn({ err, report: report.id }, 'could not read a Rocket report again');
      return report;
    }
  }

  /** Takes a report back that shows nowhere; a failure is logged (its row ends with its time). */
  private async takeBack(report: RocketReport): Promise<void> {
    try {
      // By its version (review L1): a refine meanwhile is not taken back with it.
      const version = { id: report.id, madeAt: report.madeAt };
      // Pine's own undo (plan 8H-2): recorded as `unposted`, whoever reported it.
      await this.options.reports.takeBack(
        report.serverId,
        [version],
        report.reporter.id,
        'unposted',
      );
    } catch (err) {
      this.options.log.warn({ err, report: report.id }, 'could not take back a Rocket report');
    }
  }
}
