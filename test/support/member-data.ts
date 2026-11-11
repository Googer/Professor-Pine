import {
  MemberRemovalError,
  type MemberData,
  type MemberHoldings,
  type MemberRemoved,
  type RemovalStep,
} from '../../src/db/repositories/member-data-repository.js';
import type { Party } from '../../src/domain/party/party.js';
import { MemberRemoval, type MemberScreenshots } from '../../src/services/member-removal.js';
import { createTestLogger } from './test-logger.js';

/** What the database holds of a member Pine has never met: nothing. */
export const NOTHING_HELD: MemberHoldings = {
  user: undefined,
  newTrains: 0,
  unownGifts: 0,
  history: { optIns: 0, boards: 0, fillIns: 0, named: 0, words: 0 },
  sessions: 0,
  toolAccess: false,
  reports: { reasons: 0, about: 0 },
  meetups: { blocks: 0, open: 0, over: 0 },
  audit: 0,
  stopReports: 0,
  stopConfirms: 0,
  accessGrants: 0,
  staffActs: 0,
};

/**
 * `MemberData` in memory, for tests of what is built on the removal service (the command; the
 * repository itself is tested against MySQL, `member-removal.db.test.ts`). A test says what the
 * database holds of a member (`hold`); `remove` takes away what `MemberDataRepository.remove`
 * takes (the row of settings, the notices, the history, the logins, the tool's row, the ids and
 * names on reports and on meetup records that are over) and leaves the rest, all or nothing: with
 * `failing` set it rejects as the repository does when that step fails, and nothing changes.
 */
export class MemoryMemberData implements MemberData {
  private readonly holdings = new Map<string, MemberHoldings>();
  /** The members asked about, in order. */
  readonly looks: string[] = [];
  /** The members whose data was removed, in order. */
  readonly removals: string[] = [];
  /** The step at which every removal fails; undefined for none. */
  failing: RemovalStep | undefined;

  /** The database holds this of the member (what is not named: nothing). */
  hold(memberId: string, held: Partial<MemberHoldings>): void {
    this.holdings.set(memberId, { ...NOTHING_HELD, ...held });
  }

  held(memberId: string): Promise<MemberHoldings> {
    this.looks.push(memberId);
    return Promise.resolve(this.holdings.get(memberId) ?? NOTHING_HELD);
  }

  remove(memberId: string): Promise<MemberRemoved> {
    if (this.failing !== undefined) {
      return Promise.reject(new MemberRemovalError(this.failing, new Error('refused')));
    }
    const held = this.holdings.get(memberId) ?? NOTHING_HELD;
    this.removals.push(memberId);
    this.holdings.set(memberId, {
      ...NOTHING_HELD,
      reports: { ...held.reports, reasons: 0 },
      meetups: { ...held.meetups, over: 0 },
      audit: held.audit,
      stopReports: held.stopReports,
      stopConfirms: held.stopConfirms,
      accessGrants: held.accessGrants,
      staffActs: held.staffActs,
    });
    return Promise.resolve({
      user: held.user,
      newTrains: held.newTrains,
      unownGifts: held.unownGifts,
      history: held.history,
      sessions: Array.from({ length: held.sessions }, (_unused, n) =>
        `${memberId}-${String(n)}`.padStart(64, '0'),
      ),
      toolAccess: held.toolAccess,
      reportReasons: held.reports.reasons,
      meetupRecords: held.meetups.over,
    });
  }
}

/** Kept screenshots in memory: how many each member sent and gave feedback on. */
export class MemoryMemberScreenshots implements MemberScreenshots {
  private readonly kept = new Map<string, { sent: number; feedback: number }>();
  /** How many screenshots of every removal cannot be removed. */
  failing = 0;

  keep(memberId: string, sent: number, feedback = 0): void {
    this.kept.set(memberId, { sent, feedback });
  }

  heldOf(memberId: string): Promise<{ sent: number; feedback: number }> {
    return Promise.resolve(this.kept.get(memberId) ?? { sent: 0, feedback: 0 });
  }

  forget(memberId: string): Promise<{ removed: number; feedback: number; failed: number }> {
    const { sent, feedback } = this.kept.get(memberId) ?? { sent: 0, feedback: 0 };
    const failed = Math.min(this.failing, sent);
    this.kept.set(memberId, { sent: failed, feedback: 0 });
    return Promise.resolve({ removed: sent - failed, feedback, failed });
  }
}

/**
 * A real `MemberRemoval` over `MemoryMemberData` and `MemoryMemberScreenshots`: pass `removal`
 * as `memberRemoval` to `createTestContext`. `parties` are the parties going on, `legacyFiles`
 * the servers whose member index holds a file of a member (none without `index`, as on an
 * installation without one), `ended` the web logins whose streams were ended, `entries` what
 * the service logged.
 */
export function memberRemovalWith(
  options: { parties?: readonly Party[]; index?: Record<string, string[]> } = {},
) {
  const data = new MemoryMemberData();
  const screenshots = new MemoryMemberScreenshots();
  const ended: string[] = [];
  const { log, entries } = createTestLogger();
  const { index } = options;
  const removal = new MemberRemoval({
    data,
    screenshots,
    parties: { active: () => options.parties ?? [] },
    ...(index === undefined
      ? {}
      : { legacyFiles: (memberId: string) => Promise.resolve(index[memberId] ?? []) }),
    endSession: (id) => ended.push(id),
    log,
  });
  return { removal, data, screenshots, ended, entries };
}
