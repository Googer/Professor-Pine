import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import {
  ALICE,
  asRaid,
  MINUTE,
  PARTY_NOW,
  testMeetup,
  testRaid,
  testRaidRules,
  testTrain,
  withAttendees,
  stops,
  gym,
} from '../../../test/support/parties.js';
import { HISTORY_MUST_NOT_FAIL } from '../../../test/support/history.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import { endParty } from '../../domain/party/party.js';
import type { MeetupParty, RaidParty, TrainParty } from '../../domain/party/party.js';
import { setHatchTime } from '../../domain/party/raid.js';
import { PartyStatus } from '../../domain/party/status.js';
import { PartyStore } from '../../services/party-store.js';
import type { DB } from '../types.js';
import { PartyRepository } from './party-repository.js';

const ID = (n: number): string => `00000000-0000-4000-8000-00000000000${String(n)}`;
const POST = '1234567890123456789';
const FORUM = '1234567890123456700';

describe('PartyRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let parties: PartyRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    parties = new PartyRepository(db, HISTORY_MUST_NOT_FAIL);
    await sql`insert into Guild (id, snowflake) values (1, '412345678901234567')`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
      db,
    );
    await sql`insert into Gym (id, name) values (1, 'Fountain'), (2, 'Library')`.execute(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Party').execute();
  });

  /** A raid with times, a second attendee, a post and a mirror: every column in use. */
  function fullRaid(n = 1): RaidParty {
    const raid = setHatchTime(
      testRaid({ id: ID(n) }),
      PARTY_NOW + 30 * MINUTE,
      testRaidRules(),
      PARTY_NOW,
    );
    return {
      ...withAttendees(raid, { [ALICE]: { status: PartyStatus.Present, number: 2, remote: true } }),
      forumChannelId: FORUM,
      forumPostId: String(BigInt(POST) + BigInt(n)),
      regionLinkMessageId: '1234567890123456600',
      mirrorMessages: [
        { channelId: '1234567890123456500', messageId: '1234567890123456501', kind: 'ex' },
      ],
      deletionTime: PARTY_NOW + 120 * MINUTE,
    };
  }

  it('stores a new raid and reads it back exactly', async () => {
    const egg = testRaid();
    await parties.insert(egg);
    await expect(parties.findById(egg.id)).resolves.toEqual({ ok: true, party: egg });

    const full = fullRaid(2);
    await parties.insert(full);
    await expect(parties.findById(full.id)).resolves.toEqual({ ok: true, party: full });
    await expect(parties.findById(ID(9))).resolves.toBeUndefined();
  });

  /**
   * A meetup with times, a second attendee, a post, a description and a place (a pin named by
   * a place near it and by its link): every column and every part of the document in use.
   */
  function fullMeetup(n = 1): MeetupParty {
    const meetup = withAttendees(testMeetup({ id: ID(n), name: 'Picnic “by the lake” 🧺' }), {
      [ALICE]: { status: PartyStatus.Present, number: 2, remote: true },
    });
    return {
      ...meetup,
      forumChannelId: FORUM,
      forumPostId: String(BigInt(POST) + BigInt(n)),
      regionLinkMessageId: '1234567890123456600',
      mirrorMessages: [
        {
          channelId: String(BigInt(POST) + BigInt(n)),
          messageId: '1234567890123456501',
          kind: 'status',
        },
      ],
      endTime: PARTY_NOW + 180 * MINUTE,
      lastPossibleTime: PARTY_NOW + 180 * MINUTE,
      deletionTime: PARTY_NOW + 245 * MINUTE,
      timed: { ...meetup.timed, startTime: PARTY_NOW + 60 * MINUTE },
      meetup: {
        description: 'Bring snacks.\nWe meet at the fountain. 🍪',
        place: {
          kind: 'pin',
          lat: 40.438123,
          lon: -79.923061,
          near: { kind: 'stop', title: 'Fountain “Square” 🧺' },
          linkName: 'Blue Tent',
        },
      },
    };
  }

  it('keeps the place of a meetup that is a gym, PokéStop or Power Spot, as it was named', async () => {
    const meetup: MeetupParty = {
      ...fullMeetup(7),
      meetup: {
        description: null,
        place: {
          kind: 'powerspot',
          id: '0123456789abcdef0123456789abcdef.16',
          title: 'Café “Élan” Garden',
          lat: 40.05,
          lon: -80.05,
          address: '12 Maple Avenue, Pinewood',
          image: 'https://lh3.googleusercontent.com/garden',
        },
      },
    };
    await parties.insert(meetup);
    expect(await parties.findById(meetup.id)).toEqual({ ok: true, party: meetup });
  });

  it('stores a new meetup and reads it back exactly, by itself and in the list', async () => {
    const meetup = fullMeetup();
    await parties.insert(meetup);
    expect(await parties.findById(meetup.id)).toEqual({ ok: true, party: meetup });
    expect(await parties.listActive()).toEqual({ parties: [meetup], unreadable: [] });
    const row = await db
      .selectFrom('Party')
      .select(['type', 'gymId', 'hatchTime', 'endTime'])
      .where('id', '=', meetup.id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      type: 'meetup',
      gymId: null,
      hatchTime: null,
      endTime: String(PARTY_NOW + 180 * MINUTE),
    });
  });

  it('saves the changes of a meetup: its name, its times, its end', async () => {
    const meetup = fullMeetup();
    await parties.insert(meetup);
    const changed: MeetupParty = {
      ...meetup,
      endTime: null,
      lastPossibleTime: PARTY_NOW + 24 * 60 * MINUTE,
      deletionTime: null,
      updatedAt: PARTY_NOW + MINUTE,
      timed: { name: 'Picnic', startTime: null },
      meetup: { description: null, place: null },
    };
    expect(await parties.save(changed)).toBe(true);
    expect(await parties.findById(meetup.id)).toEqual({ ok: true, party: changed });
    expect(await parties.save(endParty(changed))).toBe(true);
    expect(await parties.listActive()).toEqual({ parties: [], unreadable: [] });
  });

  /** A train with times, a route it is half-way along, a conductor, a boss and two groups. */
  function fullTrain(n = 1): TrainParty {
    const train = withAttendees(testTrain({ id: ID(n), name: 'Saturday “legendaries” 🚂' }), {
      [ALICE]: { status: PartyStatus.Present, number: 2, group: 'B' },
    });
    return {
      ...train,
      forumChannelId: FORUM,
      forumPostId: String(BigInt(POST) + BigInt(n)),
      regionLinkMessageId: '1234567890123456600',
      endTime: PARTY_NOW + 180 * MINUTE,
      lastPossibleTime: PARTY_NOW + 180 * MINUTE,
      groups: [{ id: 'A' }, { id: 'B', label: 'by car' }],
      defaultGroupId: 'B',
      timed: { ...train.timed, startTime: PARTY_NOW + 60 * MINUTE },
      train: {
        kind: 'raid',
        route: stops(2, 1),
        stop: 1,
        finishedFrom: null,
        atEnd: 'loop',
        conductorId: ALICE,
        boss: { key: 'yveltal' },
        // Split off another train, and a group of its own split off it (plan 8T).
        splitFrom: {
          partyId: '00000000-0000-4000-8000-0000000000aa',
          postId: '300000000000000020',
        },
        splitOff: [
          {
            partyId: '00000000-0000-4000-8000-0000000000bb',
            postId: '300000000000000021',
            group: 'C',
            label: 'Fast',
          },
        ],
      },
    };
  }

  it('stores a new train and reads it back exactly, by itself and in the list', async () => {
    const train = fullTrain();
    await parties.insert(train);
    expect(await parties.findById(train.id)).toEqual({ ok: true, party: train });
    expect(await parties.listActive()).toEqual({ parties: [train], unreadable: [] });
    const row = await db
      .selectFrom('Party')
      .select(['type', 'gymId', 'hatchTime', 'endTime'])
      .where('id', '=', train.id)
      .executeTakeFirstOrThrow();
    // The gym of a train is the stop it is at, in the document: the column stays empty.
    expect(row).toEqual({
      type: 'train',
      gymId: null,
      hatchTime: null,
      endTime: String(PARTY_NOW + 180 * MINUTE),
    });
  });

  it('saves the changes of a train: its route, where it is, its conductor and boss', async () => {
    const train = fullTrain();
    await parties.insert(train);
    const changed: TrainParty = {
      ...train,
      train: {
        kind: 'raid',
        route: stops(1),
        stop: 1,
        finishedFrom: gym(1),
        atEnd: 'turn-back',
        conductorId: null,
        boss: { name: 'Newmon' },
        splitFrom: null,
        splitOff: [],
      },
      updatedAt: PARTY_NOW + 5,
    };
    expect(await parties.save(changed)).toBe(true);
    expect(await parties.findById(train.id)).toEqual({ ok: true, party: changed });
    expect(await parties.save(endParty(changed))).toBe(true);
    expect(await parties.listActive()).toEqual({ parties: [], unreadable: [] });
  });

  it('reports a train row whose document is that of a meetup, and leaves it alone', async () => {
    await parties.insert(fullMeetup());
    await sql`update Party set type = 'train' where id = ${ID(1)}`.execute(db);
    expect((await parties.listActive()).unreadable).toMatchObject([
      { id: ID(1), problem: 'a train without its train details' },
    ]);
  });

  it('reports a meetup row with what only a raid has, and leaves it alone', async () => {
    await parties.insert(fullMeetup());
    await sql`update Party set gymId = 1 where id = ${ID(1)}`.execute(db);
    expect((await parties.listActive()).unreadable).toMatchObject([
      { id: ID(1), problem: 'a meetup with a gym' },
    ]);
  });

  it('keeps a 19-digit post id and times beyond 32 bits exactly', async () => {
    const raid = { ...fullRaid(), forumPostId: '1234567890123456789', endTime: 1_800_000_000_123 };
    await parties.insert(raid);
    const back = await parties.findById(raid.id);
    expect(back).toMatchObject({
      ok: true,
      party: { forumPostId: '1234567890123456789', endTime: 1_800_000_000_123 },
    });
  });

  it('keeps the attendees in the order they signed up, whatever their snowflakes', async () => {
    // MySQL sorts the keys of a JSON object; the later sign-ups here have the smaller ids.
    const raid = withAttendees(testRaid(), { [ALICE]: {}, '100000000000000009': {} });
    const order = Object.keys(raid.attendees);
    await parties.insert(raid);
    const back = await parties.findById(raid.id);
    expect(back?.ok && Object.keys(back.party.attendees)).toEqual(order);
  });

  it('saves every change of a party', async () => {
    const egg = testRaid();
    await parties.insert(egg);
    const changed: RaidParty = {
      ...fullRaid(),
      gymId: 2,
      saved: true,
      updatedAt: PARTY_NOW + MINUTE,
    };
    await expect(parties.save(changed)).resolves.toBe(true);
    await expect(parties.findById(egg.id)).resolves.toEqual({ ok: true, party: changed });

    // Ended, and its region gone.
    const closed: RaidParty = { ...endParty(changed), regionId: null };
    await expect(parties.save(closed)).resolves.toBe(true);
    await expect(parties.findById(egg.id)).resolves.toEqual({ ok: true, party: closed });

    // Back to nothing: every nullable column can be cleared again.
    await expect(parties.save(egg)).resolves.toBe(true);
    await expect(parties.findById(egg.id)).resolves.toEqual({ ok: true, party: egg });
  });

  it('never writes a party that could not be read back', async () => {
    const egg = testRaid();
    await parties.insert(egg);
    const faulty = withAttendees(egg, {
      [ALICE]: { status: PartyStatus.CompletePending, pendingUntil: 1.5 },
    });
    await expect(parties.save({ ...faulty, saved: true })).rejects.toThrow(/cannot be stored/);
    await expect(parties.findById(egg.id)).resolves.toEqual({ ok: true, party: egg });
    await expect(parties.insert({ ...faulty, id: ID(2) })).rejects.toThrow(/cannot be stored/);
    await expect(parties.findById(ID(2))).resolves.toBeUndefined();
  });

  it('never writes a mirror message the reader would refuse', async () => {
    const egg = testRaid();
    await parties.insert(egg);
    const faulty: RaidParty = {
      ...egg,
      saved: true,
      mirrorMessages: [{ channelId: '1234567890123456500', messageId: 'abc', kind: 'ex' }],
    };
    await expect(parties.save(faulty)).rejects.toThrow(/cannot be stored/);
    await expect(parties.findById(egg.id)).resolves.toEqual({ ok: true, party: egg });
  });

  it('reports a row with a status it does not know, instead of reading it as active', async () => {
    await parties.insert(testRaid());
    await sql`update Party set status = 'archived' where id = ${testRaid().id}`.execute(db);
    await expect(parties.findById(testRaid().id)).resolves.toEqual({
      ok: false,
      id: testRaid().id,
      problem: 'a party with status "archived"',
    });
  });

  it('says whether the row exists, also when nothing changed', async () => {
    const egg = testRaid();
    await expect(parties.save(egg)).resolves.toBe(false);
    await parties.insert(egg);
    await expect(parties.save(egg)).resolves.toBe(true);
  });

  it('saves two parties in one transaction: a failure of the second leaves the first as it was', async () => {
    const one = testRaid({ id: ID(1) });
    const two = testRaid({ id: ID(2) });
    const taken = fullRaid(3);
    for (const party of [one, two, taken]) await parties.insert(party);
    const changed: RaidParty = { ...fullRaid(1), forumPostId: null, updatedAt: PARTY_NOW + MINUTE };
    // The second row's post is another party's: its update fails after the first row's.
    const clash: RaidParty = { ...two, forumPostId: taken.forumPostId, saved: true };
    await expect(parties.saveBoth([{ party: changed }, { party: clash }])).rejects.toThrow(
      /Duplicate/,
    );
    await expect(parties.findById(ID(1))).resolves.toEqual({ ok: true, party: one });
    await expect(parties.findById(ID(2))).resolves.toEqual({ ok: true, party: two });

    const saved: RaidParty = { ...two, saved: true, updatedAt: PARTY_NOW + MINUTE };
    await expect(parties.saveBoth([{ party: changed }, { party: saved }])).resolves.toEqual([
      true,
      true,
    ]);
    await expect(parties.findById(ID(1))).resolves.toEqual({ ok: true, party: changed });
    await expect(parties.findById(ID(2))).resolves.toEqual({ ok: true, party: saved });
  });

  it('saves neither of two parties when a row is gone, and says which', async () => {
    const one = testRaid({ id: ID(1) });
    await parties.insert(one);
    const changed: RaidParty = { ...one, saved: true };
    await expect(
      parties.saveBoth([{ party: changed }, { party: testRaid({ id: ID(5) }) }]),
    ).resolves.toEqual([true, false]);
    await expect(parties.findById(ID(1))).resolves.toEqual({ ok: true, party: one });
  });

  it('saves neither of two parties when one could not be read back', async () => {
    const one = testRaid({ id: ID(1) });
    const two = testRaid({ id: ID(2) });
    await parties.insert(one);
    await parties.insert(two);
    const faulty = withAttendees(two, {
      [ALICE]: { status: PartyStatus.CompletePending, pendingUntil: 1.5 },
    });
    await expect(
      parties.saveBoth([{ party: { ...one, saved: true } }, { party: faulty }]),
    ).rejects.toThrow(/cannot be stored/);
    await expect(parties.findById(ID(1))).resolves.toEqual({ ok: true, party: one });
  });

  it('refuses a second party for the same post, and a second row with the same id', async () => {
    await parties.insert(fullRaid(1));
    await expect(parties.insert({ ...fullRaid(1), id: ID(2) })).rejects.toThrow(/Duplicate/);
    await expect(parties.insert(fullRaid(1))).rejects.toThrow(/Duplicate/);
    // Parties without a post do not collide with each other.
    await parties.insert(testRaid({ id: ID(3) }));
    await parties.insert(testRaid({ id: ID(4) }));
  });

  it('lists the active parties oldest first and leaves ended ones out', async () => {
    await parties.insert(testRaid({ id: ID(2), now: PARTY_NOW + MINUTE }));
    await parties.insert(testRaid({ id: ID(5), now: PARTY_NOW }));
    await parties.insert(testRaid({ id: ID(1), now: PARTY_NOW }));
    await parties.insert(endParty(testRaid({ id: ID(3), now: PARTY_NOW - MINUTE })));
    const { parties: active, unreadable } = await parties.listActive();
    expect(active.map((party) => party.id)).toEqual([ID(1), ID(5), ID(2)]);
    expect(unreadable).toEqual([]);
  });

  it('loads a raid stored with the EX tier beside an elite raid at the same gym: a start is not stopped', async () => {
    const elite = { level: 'Elite', shadow: false } as const;
    await parties.insert(testRaid({ id: ID(1), tier: elite }));
    await parties.insert(testRaid({ id: ID(2), tier: elite, now: PARTY_NOW + MINUTE }));
    // As a version with the EX tier stored it: two raids of different kinds could share a gym.
    await sql`
      update Party set state = json_set(state, '$.raid.tier.level', 'EX')
      where id = ${ID(2)}`.execute(db);
    const { log, entries } = createTestLogger();
    const store = new PartyStore({ storage: parties, log, now: () => PARTY_NOW + 2 * MINUTE });
    await store.load();
    // Both are read, as two elite raids at one gym, and nothing is reported.
    expect(store.active().map((party) => [party.id, asRaid(party).raid.tier])).toEqual([
      [ID(1), elite],
      [ID(2), elite],
    ]);
    expect(entries.filter((entry) => Number(entry.level) >= 40)).toEqual([]);
    // The oldest stands for the gym where a new report asks; each ends by its own clock.
    expect(store.raidAt(1, 1, PARTY_NOW + 2 * MINUTE)?.id).toBe(ID(1));
    // A change of the one that was stored with EX is written back as an elite raid.
    const changed = await store.update(ID(2), (party) => ({ party: { ...party, saved: true } }));
    expect(changed).toMatchObject({ written: true });
    const levels = await sql<{ level: string }>`
      select json_unquote(json_extract(state, '$.raid.tier.level')) as level
      from Party order by id`.execute(db);
    expect(levels.rows.map((found) => found.level)).toEqual(['Elite', 'Elite']);
  });

  it('reports rows it cannot read and still lists the others', async () => {
    await parties.insert(testRaid({ id: ID(1) }));
    await parties.insert({ ...fullRaid(2), createdAt: PARTY_NOW + MINUTE });
    await parties.insert(testRaid({ id: ID(3), now: PARTY_NOW + 2 * MINUTE }));
    await sql`update Party set state = '{"v": 99}' where id = ${ID(2)}`.execute(db);
    await sql`update Party set type = 'train' where id = ${ID(3)}`.execute(db);
    const { parties: active, unreadable } = await parties.listActive();
    expect(active.map((party) => party.id)).toEqual([ID(1)]);
    expect(unreadable).toEqual([
      {
        id: ID(2),
        problem: expect.stringMatching(/^state: /) as string,
        forumChannelId: FORUM,
        forumPostId: String(BigInt(POST) + 2n),
      },
      {
        id: ID(3),
        // The row says train, its document is that of a raid.
        problem: 'a train without its name and start',
        forumChannelId: null,
        forumPostId: null,
      },
    ]);
    await expect(parties.findById(ID(2))).resolves.toMatchObject({ ok: false, id: ID(2) });
  });

  it('keeps names, teams, emoji, group labels, prompts and who asked whom exactly', async () => {
    const crowd = '😀'.repeat(32);
    const base = withAttendees(testRaid(), {
      [ALICE]: { name: crowd, team: 'mystic', group: 'A' },
      '100000000000000009': {
        name: 'Bob',
        team: 'valor',
        group: 'B',
        status: PartyStatus.CompletePending,
        pendingUntil: PARTY_NOW + 300_000,
        askedBy: ALICE,
      },
    });
    const raid: RaidParty = {
      ...base,
      groups: [{ id: 'A' }, { id: 'B', label: '🌳 park side 🌳' }],
      prompts: {
        completion: [
          { id: '1234567890123456701', members: ['100000000000000009', ALICE] },
          { id: '1234567890123456702', members: [] },
        ],
        warning: '1234567890123456703',
      },
    };
    await parties.insert(raid);
    const listed = await parties.listActive();
    expect(listed.parties).toEqual([raid]);
    expect(listed.unreadable).toEqual([]);

    const renamed: RaidParty = {
      ...raid,
      saved: true,
      attendees: {
        ...raid.attendees,
        [ALICE]: { ...raid.attendees[ALICE]!, name: '🎉 Alice 🎉' },
      },
    };
    await expect(parties.save(renamed)).resolves.toBe(true);
    expect((await parties.listActive()).parties).toEqual([renamed]);
  });

  it('reads a version 1 document as a party without names, teams and prompts', async () => {
    const raid = withAttendees(testRaid(), { [ALICE]: { number: 2 } });
    await parties.insert(raid);
    const [row] = await sql<{ state: unknown }>`select state from Party where id = ${raid.id}`
      .execute(db)
      .then((result) => result.rows);
    const stored = (typeof row?.state === 'string' ? JSON.parse(row.state) : row?.state) as Record<
      string,
      unknown
    >;
    const { prompts: _prompts, ...rest } = stored;
    const old = {
      ...rest,
      v: 1,
      attendees: (stored.attendees as Record<string, unknown>[]).map(
        ({ name: _name, team: _team, ...attendee }) => attendee,
      ),
    };
    await sql`update Party set state = ${JSON.stringify(old)} where id = ${raid.id}`.execute(db);
    const { parties: active, unreadable } = await parties.listActive();
    expect(unreadable).toEqual([]);
    expect(active).toHaveLength(1);
    expect(active[0]?.prompts).toEqual({ completion: [], warning: null });
    expect(active[0]?.attendees[ALICE]).toEqual({
      number: 2,
      status: PartyStatus.Coming,
      group: 'A',
      remote: false,
    });
  });

  it('reads a version 2 document: its questions become records that asked nobody', async () => {
    const raid = withAttendees(testRaid(), { [ALICE]: { number: 2, name: 'Alice' } });
    await parties.insert(raid);
    const [row] = await sql<{ state: unknown }>`select state from Party where id = ${raid.id}`
      .execute(db)
      .then((result) => result.rows);
    const stored = (typeof row?.state === 'string' ? JSON.parse(row.state) : row?.state) as Record<
      string,
      unknown
    >;
    const old = {
      ...stored,
      v: 2,
      prompts: { completion: ['1234567890123456701'], warning: '1234567890123456703' },
    };
    await sql`update Party set state = ${JSON.stringify(old)} where id = ${raid.id}`.execute(db);
    const { parties: active, unreadable } = await parties.listActive();
    expect(unreadable).toEqual([]);
    expect(active[0]?.prompts).toEqual({
      completion: [{ id: '1234567890123456701', members: [] }],
      warning: '1234567890123456703',
    });
    expect(active[0]?.attendees[ALICE]?.name).toBe('Alice');
  });

  it('says which of some posts belong to an ended party', async () => {
    const posted = (n: number, post: string): RaidParty => ({
      ...testRaid({ id: ID(n) }),
      forumChannelId: FORUM,
      forumPostId: post,
    });
    await parties.insert(posted(1, '1234567890123456711'));
    await parties.insert(endParty(posted(2, '1234567890123456712')));
    await parties.insert(endParty(posted(3, '1234567890123456713')));
    await parties.insert(endParty(testRaid({ id: ID(4) })));
    const asked = ['1234567890123456711', '1234567890123456712', '1234567890123456799'];
    await expect(parties.endedPosts(asked)).resolves.toEqual(['1234567890123456712']);
    await expect(parties.endedPosts([])).resolves.toEqual([]);
  });

  it('keeps the party when its gym or region is deleted', async () => {
    await sql`insert into Gym (id, name) values (3, 'Gone')`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (2, 1, 1234567890123456787)`.execute(
      db,
    );
    await parties.insert(testRaid({ gymId: 3, regionId: 2 }));
    await sql`delete from Gym where id = 3`.execute(db);
    await sql`delete from Region where id = 2`.execute(db);
    const back = await parties.findById(testRaid().id);
    expect(back).toMatchObject({ ok: true, party: { gymId: null, regionId: null } });
  });

  it('still reads an ended raid whose gym was deleted, wherever ended raids are read', async () => {
    // Deleting a gym must not be stopped by the raids that once were there: the key of
    // `Party.gymId` sets it to null, for an ended row as for an active one.
    const rule = await sql<{ rule: string }>`
      select delete_rule as rule from information_schema.referential_constraints
      where constraint_schema = database() and table_name = 'Party'
        and constraint_name = 'party_gymid_foreign'`.execute(db);
    expect(rule.rows.map((row) => row.rule)).toEqual(['SET NULL']);

    await sql`insert into Gym (id, name) values (4, 'Gone')`.execute(db);
    const ended: RaidParty = {
      ...endParty(fullRaid(5)),
      gymId: 4,
      updatedAt: PARTY_NOW,
    };
    const post = ended.forumPostId ?? '';
    await parties.insert(ended);
    const deleted = await db.deleteFrom('Gym').where('id', '=', 4).executeTakeFirst();
    expect(deleted.numDeletedRows).toBe(1n);

    const back = await parties.findById(ended.id);
    expect(back).toEqual({ ok: true, party: { ...ended, gymId: null } });
    await expect(parties.endedPosts([post])).resolves.toEqual([post]);
  });

  it('lists the forums that parties name, each once per server, ended parties too', async () => {
    await sql`insert ignore into Guild (id, snowflake) values (2, '412345678901234568')`.execute(
      db,
    );
    const posted = (n: number, forum: string | null, guildId = 1): RaidParty => ({
      ...testRaid({ id: ID(n), guildId }),
      forumChannelId: forum,
      forumPostId: forum === null ? null : String(BigInt(POST) + BigInt(n)),
    });
    await expect(parties.partyForums()).resolves.toEqual([]);
    await parties.insert(posted(1, FORUM));
    await parties.insert(endParty(posted(2, FORUM)));
    await parties.insert(endParty(posted(3, '1234567890123456701')));
    await parties.insert(posted(4, null));
    await parties.insert(posted(5, FORUM, 2));
    await expect(parties.partyForums()).resolves.toEqual([
      { forumChannelId: FORUM, guildId: 1 },
      { forumChannelId: '1234567890123456701', guildId: 1 },
      { forumChannelId: FORUM, guildId: 2 },
    ]);
    // Those of one server, by the index on both columns.
    await expect(parties.partyForums(2)).resolves.toEqual([{ forumChannelId: FORUM, guildId: 2 }]);
    await expect(parties.partyForums(3)).resolves.toEqual([]);
  });
});
