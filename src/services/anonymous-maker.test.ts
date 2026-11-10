import { describe, expect, it } from 'vitest';
import { classic } from '../../test/support/messages.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { BOB, REPORTER, stops, gym } from '../../test/support/parties.js';
import { createdTrain, reportedRaid } from '../../test/support/party-service.js';
import { PartyStatus } from '../domain/party/status.js';

const maker = { id: REPORTER, name: 'Rhea' };
const bob = { id: BOB, name: 'Bob' };

/** Everything said in the post since the train was made, line by line. */
async function lines(made: Awaited<ReturnType<typeof createdTrain>>): Promise<string[]> {
  await made.trains.flush();
  await made.timed.flush();
  await made.attendance.flush();
  return made.said().flatMap((text) => text.split('\n'));
}

describe('the lines of a raid whose reporter asked not to be named', () => {
  const T5 = { level: 'T5', shadow: false } as const;
  const HOUR = 60 * 60_000;

  async function raidLines(made: Awaited<ReturnType<typeof reportedRaid>>): Promise<string[]> {
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  }

  it('say what the reporter changed without naming them', async () => {
    const made = await reportedRaid({ anonymous: true });
    const { id } = made.party;
    await made.raids.setHatchTime(id, maker, made.clock.now + HOUR / 2);
    await made.raids.setEndTime(id, maker, made.clock.now + HOUR);
    await made.raids.setDuration(id, maker, 30);
    await made.raids.setBoss(id, maker, {
      tier: { level: 'T3', shadow: false },
      boss: null,
      label: 'T3 egg',
    });
    await made.raids.setBoss(id, maker, {
      tier: T5,
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    const entry = catalogueFixture().byKey('yveltal');
    await made.raids.setMoveset(id, maker, { fastMove: entry?.fastMoves[0] ?? '' });
    await made.raids.setGym(id, maker, 2);
    await made.attendance.setMeetingTime(id, maker, made.clock.now + HOUR / 2 + 5 * 60_000);
    await made.attendance.setMeetingTime(id, maker, null);
    const said = await raidLines(made);
    expect(said.join('\n')).not.toMatch(/Rhea|<@/);
    // The meeting times are said at once, the other lines gathered: the order is not fixed.
    expect(said).toHaveLength(9);
    expect(said).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^The hatch time was set: /),
        expect.stringMatching(/^The end time was set: /),
        'The length of this raid was set to 30 minutes.',
        'This was changed to: T3 egg.',
        'The boss was set: **Yveltal (T5)**.',
        expect.stringMatching(/^The fast move was set: /),
        expect.stringMatching(/^This raid was moved to \*\*/),
        expect.stringMatching(/^The meeting time was set: /),
        'The meeting time was canceled.',
      ]),
    );
  });

  it('name anybody else who changes it', async () => {
    const made = await reportedRaid({ anonymous: true });
    await made.raids.setBoss(made.party.id, bob, {
      tier: T5,
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    expect(await raidLines(made)).toEqual([`**Bob** (<@${BOB}>) set the boss: **Yveltal (T5)**.`]);
  });
});

describe('the lines of a train whose maker asked not to be named', () => {
  it('say what the maker did without naming them', async () => {
    const made = await createdTrain({
      anonymous: true,
      autoStatus: PartyStatus.NotInterested,
      route: stops(4),
    });
    const { id } = made.party;
    await made.trains.addStop(id, maker, gym(1));
    await made.trains.moveStop(id, maker, 2, 1);
    await made.trains.removeStop(id, maker, 1);
    await made.trains.setBoss(id, maker, { boss: { name: 'Mewtwo' }, label: 'Mewtwo' });
    await made.trains.setBoss(id, maker, { boss: null, label: '' });
    await made.timed.setName(id, maker, 'Sunday legendaries');
    await made.timed.setEndTime(id, maker, false, made.clock.now + 3 * 60 * 60_000);
    await made.timed.setEndTime(id, maker, false, null);
    const said = await lines(made);
    expect(said.join('\n')).not.toMatch(/Rhea|<@/);
    expect(said).toEqual([
      'Stop 2 was added to the route: **The Stacks**.',
      '**The Stacks** was moved to stop 1 of the route.',
      '**The Stacks** was taken off the route.',
      'The boss this train is after was set: **Mewtwo**.',
      'The boss of this train was removed.',
      'This train was renamed: **Sunday legendaries**.',
      expect.stringMatching(/^The end of this train was set: /),
      'The end time of this train was removed.',
    ]);
    // Clearing the route is for the conductor and for staff: a maker who is staff.
    const boarded = await createdTrain({ anonymous: true, route: stops(4) });
    await boarded.trains.clearRoute(boarded.party.id, maker, true);
    expect(await lines(boarded)).toEqual(['The route was cleared.']);
  });

  it('do not name the maker in the direct message about the start either', async () => {
    const made = await createdTrain({ anonymous: true, autoStatus: PartyStatus.NotInterested });
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.timed.setStartTime(made.party.id, maker, false, made.clock.now + 2 * 60 * 60_000);
    await made.timed.flush();
    await made.notify.flush();
    const dm = classic(made.dms.to(BOB)[0]);
    expect(dm.content).toMatch(
      /^Start at <t:\d+:\w> for the train [^(]*\. \d+ trainers? (is|are) attending: https:/,
    );
    expect(dm.content).not.toMatch(/Rhea/);
    expect((await lines(made)).join(' ')).not.toMatch(/Rhea/);
  });

  it('name everybody else, and the maker of a train that names its maker', async () => {
    const hidden = await createdTrain({ anonymous: true, route: stops(4) });
    await hidden.attendance.signUp(hidden.party.id, bob, PartyStatus.Interested);
    await hidden.trains.addStop(hidden.party.id, bob, gym(1));
    expect(await lines(hidden)).toContain(
      `**Bob** (<@${BOB}>) added stop 2 to the route: **The Stacks**.`,
    );
    const named = await createdTrain({ route: stops(4) });
    await named.trains.addStop(named.party.id, maker, gym(1));
    expect(await lines(named)).toContain(
      `**Rhea** (<@${REPORTER}>) added stop 2 to the route: **The Stacks**.`,
    );
  });
});
