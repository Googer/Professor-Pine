import type { ModerationReport } from '../../src/domain/moderation/reports.js';
import type { Party } from '../../src/domain/party/party.js';
import { ModerationReports } from '../../src/services/moderation-reports.js';
import { meetupSafetyWith, MOD_CHANNEL, type SafetyOptions } from './meetup-safety-service.js';
import type { ServiceOverrides } from './party-service.js';
import { MemoryReports } from './reports.js';
import { WEST_CHANNEL } from './gyms.js';
import { LIBRARY } from './meetup-safety-cases.js';
import { ALICE, BOB, PARTY_NOW } from './parties.js';

/**
 * Reports to the moderators over the services of `meetupSafetyWith` (the fake gateway with the
 * moderators' channel `MOD_CHANNEL`, the party service and store, meetup safety, the clock) and
 * `MemoryReports` (`reportStore`), following the store's parties as the bot does (`watch`).
 * `reportPostOf(report)` is the message of the moderators' post of a report as it is now.
 */
export async function reportsWith(
  options: SafetyOptions = {},
  parties: readonly Party[] = [],
  overrides: ServiceOverrides = {},
) {
  const made = await meetupSafetyWith(options, parties, overrides);
  const reportStore = new MemoryReports();
  const reports = new ModerationReports({
    storage: reportStore,
    gateway: made.gateway,
    parties: made.service,
    safety: made.safety,
    store: made.store,
    regions: made.regions,
    gyms: made.gyms,
    settings: made.settings,
    log: made.log,
    now: () => made.clock.now,
  });
  reports.watch(made.store);
  const reportPostOf = (report: Pick<ModerationReport, 'messageId'>) =>
    made.gateway.messagesIn(MOD_CHANNEL).find((sent) => sent.id === report.messageId)?.message;
  return { ...made, reportStore, reports, reportPostOf };
}

/** The server of the fakes, as the reports name it. */
export const REPORT_SERVER = '412345678901234567';

/**
 * `reportsWith`, and a meetup of Alice's at the Little Free Library (a PokéStop) a day ahead,
 * with `report(reporterId?, reason?, name?)`, a member's report of it (Bob's by default).
 */
export async function reportedMeetup(options: SafetyOptions = {}) {
  const made = await reportsWith(options);
  const outcome = await made.service.createMeetup({
    name: 'Book swap',
    creatorId: ALICE,
    creator: { name: 'Alice' },
    regionChannelId: WEST_CHANNEL,
    place: LIBRARY,
    startTime: PARTY_NOW + 24 * 3_600_000,
    description: 'Bring a book.',
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  const party = outcome.party;
  const postId = party.forumPostId ?? '';
  const report = (reporterId = BOB, reason = 'It is somebody’s front yard.', name = 'Bob') =>
    made.reports.reportParty({
      serverId: REPORT_SERVER,
      partyId: party.id,
      reporter: { id: reporterId, name },
      reason,
      roleIds: ['300000000000000001'],
    });
  return { ...made, party, postId, report };
}
