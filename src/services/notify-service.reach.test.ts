import { describe, expect, it } from 'vitest';
import { RecordingReach } from '../../test/support/reach.js';
import { ALICE, at, BOB, REPORTER } from '../../test/support/parties.js';
import { createdTrain, partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import { PartyStatus } from '../domain/party/status.js';

const DORA = '200000000000000005';
const YVELTAL = pokemonTarget(717);
const member = (id: string, name: string) => ({ id, name });
const yveltal = {
  tier: { level: 'T5', shadow: false },
  boss: { key: 'yveltal' },
  label: 'Yveltal (T5)',
} as const;
/** A user id of 18 digits for a number. */
const idOf = (n: number): string => String(300_000_000_000_000_000n + BigInt(n));

describe('NotifyService: how many members its news reached (plan 8H-3)', () => {
  it('counts each run of a party’s news that told anyone, each member once for the party', async () => {
    const reach = new RecordingReach();
    // An egg nobody wants: its report tells nobody, and counts nothing.
    const made = await reportedRaid({}, { notifying: { reach } });
    await made.notify.flush();
    expect(reach.runs).toEqual([]);
    const guild = made.gateway.guildId;
    await made.wants.set(ALICE, guild, YVELTAL, 'raid');
    await made.gymTargets.add(ALICE, guild, 2);
    await made.gymTargets.add(DORA, guild, 2);
    const party = made.party.id;
    await made.raids.setBoss(party, member(REPORTER, 'Rita'), yveltal);
    await made.notify.flush();
    expect(made.dms.recipients).toEqual([ALICE]);
    // Another gym: Alice is told again for her other gym target, Dora for hers; only Dora is new.
    made.clock.now += 60_000;
    await made.raids.setGym(party, member(BOB, 'Bob'), 2);
    await made.notify.flush();
    expect(made.dms.to(ALICE)).toHaveLength(2);
    expect(made.dms.to(DORA)).toHaveLength(1);
    expect(reach.runs).toEqual([
      { of: { party, subject: 'boss' }, members: 1, at: made.clock.now - 60_000 },
      { of: { party, subject: 'gym' }, members: 1, at: made.clock.now },
    ]);
  });

  it('counts a new train', async () => {
    const reach = new RecordingReach();
    const trains = await partyServiceWith([], { notifying: { reach } });
    for (const id of [ALICE, BOB]) await trains.newTrains.set(id, trains.gateway.guildId, true, 1);
    const train = await createdTrain(
      {},
      { notifying: { reach } },
      {
        storage: trains.storage,
        gateway: trains.gateway,
        regions: trains.regions,
        clock: trains.clock,
        tags: trains.tags,
        newTrains: trains.newTrains,
      },
    );
    await train.notify.flush();
    expect(reach.runs).toEqual([
      { of: { party: train.party.id, subject: 'reported' }, members: 2, at: train.clock.now },
    ]);
  });

  it('counts no time to meet at: it tells who is in already', async () => {
    const reach = new RecordingReach();
    const made = await reportedRaid({ boss: { key: 'yveltal' } }, { notifying: { reach } });
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    await made.attendance.setMeetingTime(
      made.party.id,
      member(REPORTER, 'Rita'),
      at('2026-10-13T14:40'),
    );
    await made.notify.flush();
    expect(made.dms.to(ALICE)).toHaveLength(1);
    expect(reach.runs).toEqual([]);
  });

  it('counts what a run put in line before the party ended in the middle of it', async () => {
    const reach = new RecordingReach();
    const made = await reportedRaid({}, { notifying: { reach } });
    for (let n = 0; n < 150; n++) made.wants.add(idOf(n), made.gateway.guildId, 717, 'raid');
    const asked = made.members.batches.length;
    let first: () => void = () => undefined;
    let second: () => void = () => undefined;
    made.members.holding = new Promise((resolve) => {
      first = resolve;
    });
    await made.raids.setBoss(made.party.id, member(REPORTER, 'Rita'), yveltal);
    await made.members.asks.reached(asked + 1);
    // The second batch is held while the party ends.
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
    expect(reach.runs).toEqual([
      { of: { party: made.party.id, subject: 'boss' }, members: 99, at: made.clock.now },
    ]);
  });

  it('hands the count over batch by batch, as each is put in line', async () => {
    const reach = new RecordingReach();
    const made = await reportedRaid({}, { notifying: { reach } });
    for (let n = 0; n < 150; n++) made.wants.add(idOf(n), made.gateway.guildId, 717, 'raid');
    await made.raids.setBoss(made.party.id, member(REPORTER, 'Rita'), yveltal);
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(150);
    const of = { party: made.party.id, subject: 'boss' };
    expect(reach.runs).toEqual([
      { of, members: 99, at: made.clock.now },
      { of, members: 51, at: made.clock.now },
    ]);
  });

  it('logs a recorder that fails and sends the DMs all the same', async () => {
    const reach = new RecordingReach();
    reach.failing = new Error('the history is broken');
    const made = await reportedRaid({}, { notifying: { reach } });
    await made.wants.set(ALICE, made.gateway.guildId, YVELTAL, 'raid');
    await made.raids.setBoss(made.party.id, member(REPORTER, 'Rita'), yveltal);
    await made.notify.flush();
    expect(made.dms.recipients).toEqual([ALICE]);
    expect(
      made.entries.filter(
        (entry) => entry.msg === 'could not record how many members news reached; it is lost',
      ),
    ).toEqual([
      expect.objectContaining({
        level: 40,
        of: { party: made.party.id, subject: 'boss' },
        members: 1,
      }),
    ]);
  });
});
