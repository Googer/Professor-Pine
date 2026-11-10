import type { HistoryStorage } from '../db/repositories/history-repository.js';
import type { StopReportStorage } from '../db/repositories/stop-report-repository.js';
import type { Logger } from '../log.js';
import type { ReachOf, ReachRecorder } from './notify-service.js';

/** What `ReachRecords` writes to. */
export interface ReachRecordsOptions {
  /** The party history: a step `reach` of the live party, summed into its record. */
  history: Pick<HistoryStorage, 'addReach'>;
  /** The reports at stops: the count of the version, copied into its record when it ends. */
  stopReports: Pick<StopReportStorage, 'addReach'>;
  log: Logger;
}

/**
 * Keeps what the notifier's news reached (plan 8H-3; design Part A, "Reach (Q3)": "sent to N
 * members"): for a party a step of its history, for a report at a stop a count on its version.
 * A party recorded meanwhile (its row gone) drops its count, said at debug; so does a version
 * replaced or swept meanwhile. A failure rejects, and the notifier logs it.
 */
export class ReachRecords implements ReachRecorder {
  constructor(private readonly options: ReachRecordsOptions) {}

  async reached(of: ReachOf, members: number, at: number): Promise<void> {
    const { history, stopReports, log } = this.options;
    if ('party' in of) {
      if (!(await history.addReach(of.party, of.subject, members, at))) {
        log.debug(
          { party: of.party, members },
          'what news of a party reached is dropped: the party is recorded already',
        );
      }
      return;
    }
    // Past `StopReportService` and its count of writes (`standingListed`): `reach` is no field of a
    // report as read, so the map's kept list cannot miss it.
    if (!(await stopReports.addReach(of.report, of.madeAt, members))) {
      log.debug(
        { report: of.report, members },
        'what news of a report reached is dropped: that version is not kept any more',
      );
    }
  }
}
