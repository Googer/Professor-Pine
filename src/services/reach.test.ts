import { describe, expect, it } from 'vitest';
import { MemoryHistory } from '../../test/support/history.js';
import { ALICE, BOB, REPORTER } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { researchReport } from '../../test/support/stop-report-cases.js';
import { MemoryStopReports } from '../../test/support/stop-reports.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import { ReachRecords } from './reach.js';

const yveltal = {
  tier: { level: 'T5', shadow: false },
  boss: { key: 'yveltal' },
  label: 'Yveltal (T5)',
} as const;

describe('ReachRecords (plan 8H-3)', () => {
  it('keeps what a raid’s news reached in its record when it ends, over its steps', async () => {
    const history = new MemoryHistory();
    const stopReports = new MemoryStopReports();
    const { log } = createTestLogger();
    const reach = new ReachRecords({ history, stopReports, log });
    const made = await reportedRaid({}, { notifying: { reach } }, { history });
    const guild = made.gateway.guildId;
    await made.wants.set(ALICE, guild, pokemonTarget(717), 'raid');
    await made.wants.set(BOB, guild, pokemonTarget(717), 'raid');
    await made.raids.setBoss(made.party.id, { id: REPORTER, name: 'Rita' }, yveltal);
    await made.notify.flush();
    expect(history.steps.filter((step) => step.kind === 'reach')).toEqual([
      { partyId: made.party.id, at: made.clock.now, kind: 'reach', subject: 'boss', value: 2 },
    ]);
    await made.service.end(made.party.id);
    expect(history.records).toEqual([expect.objectContaining({ reached: 2 })]);
  });

  it('keeps in the record what reached members before the party ended in the middle of a run', async () => {
    const history = new MemoryHistory();
    const { log } = createTestLogger();
    const reach = new ReachRecords({ history, stopReports: new MemoryStopReports(), log });
    const made = await reportedRaid({}, { notifying: { reach } }, { history });
    for (let n = 0; n < 150; n++) {
      made.wants.add(
        String(300_000_000_000_000_000n + BigInt(n)),
        made.gateway.guildId,
        717,
        'raid',
      );
    }
    const asked = made.members.batches.length;
    let first: () => void = () => undefined;
    let second: () => void = () => undefined;
    made.members.holding = new Promise((resolve) => {
      first = resolve;
    });
    await made.raids.setBoss(made.party.id, { id: REPORTER, name: 'Rita' }, yveltal);
    await made.members.asks.reached(asked + 1);
    // The second batch is held while the party ends and is recorded.
    made.members.holding = new Promise((resolve) => {
      second = resolve;
    });
    first();
    await made.members.asks.reached(asked + 2);
    await made.service.end(made.party.id);
    made.members.holding = undefined;
    second();
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(99);
    expect(history.records).toEqual([expect.objectContaining({ reached: 99 })]);
  });

  it('drops the count of a party recorded meanwhile, said at debug', async () => {
    const history = new MemoryHistory();
    const { log, entries } = createTestLogger();
    const reach = new ReachRecords({ history, stopReports: new MemoryStopReports(), log });
    await reach.reached({ party: '00000000-0000-4000-8000-0000000000aa', subject: 'boss' }, 3, 1);
    expect(history.steps).toEqual([]);
    expect(
      entries.filter(
        (entry) =>
          entry.msg === 'what news of a party reached is dropped: the party is recorded already',
      ),
    ).toEqual([expect.objectContaining({ level: 20, members: 3 })]);
  });

  it('adds what a report’s news reached to its version', async () => {
    const stopReports = new MemoryStopReports();
    const { log } = createTestLogger();
    const reach = new ReachRecords({ history: new MemoryHistory(), stopReports, log });
    const { report } = await stopReports.save(researchReport());
    await reach.reached({ report: report.id, madeAt: report.madeAt }, 2, 1);
    await reach.reached({ report: report.id, madeAt: report.madeAt + 1 }, 5, 1);
    await stopReports.removeEnded(report.endsAt);
    expect((await stopReports.historyOf(report.serverId)).map((record) => record.reach)).toEqual([
      2,
    ]);
  });
});
