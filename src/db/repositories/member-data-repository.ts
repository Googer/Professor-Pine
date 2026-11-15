import { sql, type Kysely } from 'kysely';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type { DB } from '../types.js';
import { DmContactRepository } from './dm-contact-repository.js';
import { HistoryRepository, type HistoryHeld } from './history-repository.js';
import { MeetupSafetyRepository, type MeetupRecordsHeld } from './meetup-safety-repository.js';
import { NewTrainRepository } from './new-train-repository.js';
import { ReportRepository, type ReportsHeld } from './report-repository.js';
import { RowIds } from './row-ids.js';
import { ScriptAccessRepository } from './script-access-repository.js';
import { UnownGiftRepository } from './unown-gift-repository.js';
import { UserRepository, type UserHoldings } from './user-repository.js';
import { WebSessionRepository } from './web-session-repository.js';

/**
 * What the database holds of one member across every server, counted (plan 8G: the look of the
 * operators' `/operator forget`). The first part is what `MemberData.remove` takes away or blanks, each
 * counted by the repository that removes it; the second is what it leaves.
 */
export interface MemberHoldings {
  /** Their row of settings and what hangs on it; undefined for a member without a row. */
  user: UserHoldings | undefined;
  /** The servers where they asked to be told of new trains. */
  newTrains: number;
  /** The servers where the Unown want of the old role was settled for them. */
  unownGifts: number;
  /** Their opt-ins to history and boards, their old-bot requests, the records that name them. */
  history: HistoryHeld;
  /** Their web logins. */
  sessions: number;
  /** A row of access to the Wayfarer export tool. */
  toolAccess: boolean;
  /** The record that Pine has sent them a direct message (`DmContact`, plan 19B-5). */
  dmContact: boolean;
  /**
   * Reports to the moderators: the reasons they gave, whose id and name the removal takes off
   * (the words stay), and the reports about them, which stay.
   */
  reports: ReportsHeld;
  /**
   * Meetup safety: their blocks, which stay, and their own requests, appeals and asks: `open`,
   * `unmade` and `live`, which keep their id and name, and `over`, whose id and name the removal
   * takes off.
   */
  meetups: MeetupRecordsHeld;
  /**
   * Entries of the staff's 30-day logs that name them: of parties (`PartyAudit`) what they did,
   * and what others did that names them (a train's conductor, `detail`'s `from` or `to`); of a
   * server's settings (`ServerSettingsAudit`, plan 19A-1) the changes they made. They age out.
   */
  audit: number;
  /** Reports at stops they made that still stand (`StopReport`): they end by themselves. */
  stopReports: number;
  /** Reports at stops of others they confirmed, still standing (`StopReport.confirmedBy`). */
  stopConfirms: number;
  /** Forums the bot let them into for a party going on (`PartyAccessGrant`): taken back with it. */
  accessGrants: number;
  /**
   * Records of what they did as staff, which stay as the servers' record: decisions on reports,
   * requests, appeals and asks, rulings of places, blocks they gave or lifted, boss overrides,
   * stops of Pine's own they made or changed, gym reviews and marks, imports, the event window,
   * the servers they allowed or blocked as an instance operator.
   */
  staffActs: number;
}

/** What `MemberData.remove` took away, counted as `MemberHoldings` counts it. */
export interface MemberRemoved {
  user: UserHoldings | undefined;
  newTrains: number;
  unownGifts: number;
  history: HistoryHeld;
  /** The ids of the web logins deleted, whose live streams are to be ended. */
  sessions: string[];
  toolAccess: boolean;
  dmContact: boolean;
  /** The reasons of reports their id and name were taken off. */
  reportReasons: number;
  /** The requests, appeals and asks, decided and over, their id and name were taken off. */
  meetupRecords: number;
}

/**
 * A member's data in the database as the removal service sees it (`MemberRemoval`); lets tests
 * keep it in memory. `remove` is all or nothing: when it rejects, with a `MemberRemovalError`
 * that names the step, nothing has changed. `going`: the ids of the member's meetups going on,
 * whose approved requests are not over yet (`MeetupSafetyRepository.forgetMember`).
 */
export interface MemberData {
  held(memberId: string, going?: readonly string[]): Promise<MemberHoldings>;
  remove(memberId: string, going?: readonly string[]): Promise<MemberRemoved>;
}

/** The steps of the removal, in their order, as the owner is told which one failed. */
export const REMOVAL_STEPS = {
  user: 'their settings, wants, gym notices and saved routes',
  newTrains: 'their new-train notices',
  unownGifts: 'their Unown gift rows',
  history: 'their history',
  sessions: 'their web logins',
  toolAccess: 'their access to the export tool',
  dmContact: 'the record that Pine sent them direct messages',
  reports: 'their id and name on reports to the moderators',
  meetups: 'their id and name on meetup requests, appeals and asks',
  /** After the last statement: the commit, or a deadlock that outlasted its tries there. */
  commit: 'saving the removal',
} as const;

export type RemovalStep = (typeof REMOVAL_STEPS)[keyof typeof REMOVAL_STEPS];

/**
 * What a test may hook into the removal (`MemberDataRepository`'s third argument): `step` is
 * called inside the transaction as each step begins, the commit's last; one that throws fails
 * the removal there, as the database would (a deadlock retried, anything else rolled back).
 */
export interface RemovalHooks {
  step?: (step: RemovalStep) => void | Promise<void>;
}

/** The removal failed at `step`, and its transaction was rolled back: nothing has changed. */
export class MemberRemovalError extends Error {
  constructor(
    readonly step: RemovalStep,
    cause: unknown,
  ) {
    super(`the removal of a member's data failed at ${step}`, { cause });
    this.name = 'MemberRemovalError';
  }
}

/**
 * Everything the database holds of one member, over every server, and its removal on request
 * (plan 8G, the operators' `/operator forget`): one place that names every table with a member's id.
 *
 * `remove` is one transaction over the repositories that own the tables, each of whose methods
 * joins it: the member's row of settings with their wants, gym notices and saved routes
 * (`UserRepository.forget`, the row locked first, as a member's own changes lock it), their
 * new-train notices and Unown gift rows, their history in every server exactly as an opt-out
 * takes it (`HistoryRepository.forgetEverywhere`), their web logins, their access to the export
 * tool, the record that Pine sent them direct messages (`DmContact`), and their id and name on the reasons of reports they gave and on their own meetup
 * requests, appeals and asks that are decided and over (migration 051; an approval whose meetup
 * is still going on is not, `going`). Either all of it is done or the database is as it was. A
 * deadlock (an opt-out or a login of the same member at that moment) runs all of it again.
 *
 * What it leaves, and `held` counts beside the rest: meetup blocks and rulings, reports about
 * the member, their meetup requests, appeals and asks still open, the words of those it clears,
 * the staff's 30-day log, what is live (parties, today's reports at stops and their
 * confirmations of others', the forums they were let into), what they did as staff, and every
 * count without a name.
 */
export class MemberDataRepository implements MemberData {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly ids: RowIds = RowIds.none,
    private readonly hooks: RemovalHooks = {},
  ) {}

  /** One snapshot of all of it: the counts belong together. */
  held(memberId: string, going: readonly string[] = []): Promise<MemberHoldings> {
    return inTransaction(
      this.db,
      async (trx) => ({
        user: await new UserRepository(trx).holdingsOf(memberId),
        newTrains: await new NewTrainRepository(trx).countOf(memberId),
        unownGifts: await new UnownGiftRepository(trx).countOf(memberId),
        history: await new HistoryRepository(trx).heldEverywhere(memberId),
        sessions: await new WebSessionRepository(trx).countOf(memberId),
        toolAccess: (await new ScriptAccessRepository(trx).byUser(memberId)) !== undefined,
        dmContact: (await new DmContactRepository(trx).known([memberId])).has(memberId),
        reports: await new ReportRepository(trx).heldOf(memberId),
        meetups: await new MeetupSafetyRepository(trx).heldOf(memberId, going),
        ...(await left(trx, memberId)),
      }),
      { readOnly: true },
    );
  }

  async remove(memberId: string, going: readonly string[] = []): Promise<MemberRemoved> {
    let step: RemovalStep = REMOVAL_STEPS.user;
    const at = async (next: RemovalStep): Promise<void> => {
      step = next;
      await this.hooks.step?.(next);
    };
    let removed: MemberRemoved;
    try {
      removed = await retryOnDeadlock(this.db, () =>
        inTransaction(this.db, async (trx) => {
          await at(REMOVAL_STEPS.user);
          const user = await new UserRepository(trx).forget(memberId);
          await at(REMOVAL_STEPS.newTrains);
          const newTrains = await new NewTrainRepository(trx).forget(memberId);
          await at(REMOVAL_STEPS.unownGifts);
          const unownGifts = await new UnownGiftRepository(trx).forget(memberId);
          await at(REMOVAL_STEPS.history);
          const history = await new HistoryRepository(trx).forgetEverywhere(memberId);
          await at(REMOVAL_STEPS.sessions);
          const sessions = await new WebSessionRepository(trx).removeOf(memberId);
          await at(REMOVAL_STEPS.toolAccess);
          const toolAccess = await new ScriptAccessRepository(trx).forget(memberId);
          await at(REMOVAL_STEPS.dmContact);
          const dmContact = await new DmContactRepository(trx).forget(memberId);
          await at(REMOVAL_STEPS.reports);
          const reportReasons = await new ReportRepository(trx).forgetReporter(memberId);
          await at(REMOVAL_STEPS.meetups);
          const meetupRecords = await new MeetupSafetyRepository(trx).forgetMember(memberId, going);
          // Whatever fails from here on (the commit) is the saving's, not the last statement's.
          await at(REMOVAL_STEPS.commit);
          return {
            user,
            newTrains,
            unownGifts,
            history,
            sessions: [...sessions].sort(),
            toolAccess,
            dmContact,
            reportReasons,
            meetupRecords,
          };
        }),
      );
    } catch (err) {
      throw new MemberRemovalError(step, err);
    }
    // The row is gone for good only now; inside a caller's transaction the caller forgets it.
    if (!this.db.isTransaction) this.ids.forgetUser(memberId);
    return removed;
  }
}

type Left = 'audit' | 'stopReports' | 'stopConfirms' | 'accessGrants' | 'staffActs';

/**
 * What the removal leaves, counted: the staff's log, what is live, and what the member did as
 * staff. One statement (one snapshot), each count of it a read of one table along an index that
 * begins with the member (migration 057, the index audit's X11; migration 061's for the servers an
 * instance operator allowed or blocked, plan 19C-1), added up here.
 *
 * A row that names the member in two ways counts once: where one table is read by two or three
 * columns (an entry of the log by who did it, the conductor after `$.to.id` and before
 * `$.from.id`; a block given and lifted; a stop made and changed; a server allowed and blocked),
 * each read after the first
 * leaves out the rows an earlier one counted (`not (… <=> member)`, which holds for a null as
 * well), a filter on the rows its own index found. A JSON path is read as
 * `json_unquote(json_extract(detail, '$.to.id'))`, which MySQL serves by migration 057's
 * functional index on that text cast to `char(30) collate utf8mb4_bin` (the collation
 * `json_unquote` answers in); a `cast` written here would not match it, its path taking the
 * connection's collation. The confirmations are read by `member of`, which its multi-valued
 * index serves; `json_contains` would read the table whole.
 */
async function left(db: Kysely<DB>, memberId: string): Promise<Pick<MemberHoldings, Left>> {
  const counted = await sql<Record<string, number | string>>`
    select
      (select count(*) from PartyAudit where actorId = ${memberId}) as auditActor,
      (select count(*) from PartyAudit
        where json_unquote(json_extract(detail, '$.to.id')) = ${memberId}
          and not (actorId <=> ${memberId})) as auditTo,
      (select count(*) from PartyAudit
        where json_unquote(json_extract(detail, '$.from.id')) = ${memberId}
          and not (actorId <=> ${memberId})
          and not (json_unquote(json_extract(detail, '$.to.id'))
                   <=> ${memberId})) as auditFrom,
      (select count(*) from ServerSettingsAudit where actorId = ${memberId}) as settingsAudit,
      (select count(*) from StopReport where reporterId = ${memberId}) as stopReports,
      (select count(*) from StopReport
        where ${memberId} member of (confirmedBy)) as stopConfirms,
      (select count(*) from PartyAccessGrant where memberId = ${memberId}) as accessGrants,
      (select count(*) from MeetupRequest where decidedBy = ${memberId}) as requests,
      (select count(*) from MeetupAppeal where decidedBy = ${memberId}) as appeals,
      (select count(*) from MeetupPlaceAsk where decidedBy = ${memberId}) as asks,
      (select count(*) from MeetupPlaceRuling where ruledBy = ${memberId}) as rulings,
      (select count(*) from MeetupBlock where blockedBy = ${memberId}) as blocksGiven,
      (select count(*) from MeetupBlock
        where liftedBy = ${memberId} and not (blockedBy <=> ${memberId})) as blocksLifted,
      (select count(*) from ModerationReport where decidedBy = ${memberId}) as reports,
      (select count(*) from RaidBossOverride where createdBy = ${memberId}) as overrides,
      (select count(*) from PineStop where createdBy = ${memberId}) as stopsMade,
      (select count(*) from PineStop
        where updatedBy = ${memberId} and not (createdBy <=> ${memberId})) as stopsChanged,
      (select count(*) from GymReview where decidedBy = ${memberId}) as reviews,
      (select count(*) from GymWayfarer where notInWayfarerBy = ${memberId}) as marks,
      (select count(*) from WayspotImport where staffId = ${memberId}) as imports,
      (select count(*) from EventWindow where setBy = ${memberId}) as eventWindow,
      (select count(*) from ServerSettings where updatedBy = ${memberId}) as settings,
      (select count(*) from ServerRecord where allowedBy = ${memberId}) as serversAllowed,
      (select count(*) from ServerRecord
        where blockedBy = ${memberId} and not (allowedBy <=> ${memberId})) as serversBlocked`.execute(
    db,
  );
  const row = counted.rows[0] ?? {};
  const sum = (...columns: string[]) =>
    columns.reduce((total, column) => total + Number(row[column] ?? 0), 0);
  return {
    audit: sum('auditActor', 'auditTo', 'auditFrom', 'settingsAudit'),
    stopReports: sum('stopReports'),
    stopConfirms: sum('stopConfirms'),
    accessGrants: sum('accessGrants'),
    staffActs: sum(
      'requests',
      'appeals',
      'asks',
      'rulings',
      'blocksGiven',
      'blocksLifted',
      'reports',
      'overrides',
      'stopsMade',
      'stopsChanged',
      'reviews',
      'marks',
      'imports',
      'eventWindow',
      'settings',
      'serversAllowed',
      'serversBlocked',
    ),
  };
}
