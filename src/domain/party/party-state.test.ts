import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  PARTY_NOW,
  REPORTER,
  testMeetup,
  testRaid,
  testTrain,
  withAttendees,
  stops,
  gym,
} from '../../../test/support/parties.js';
import type { DroppedPin, KnownPlace } from '../geo/place.js';
import { partyFromStored, partyMirrors, partyState, type PartyColumns } from './party-state.js';
import {
  MAX_MEETUP_DESCRIPTION,
  MAX_PARTY_NAME,
  MAX_ROUTE_STOPS,
  MAX_SPLITS_KEPT,
  TRAIN_AT_END,
  type MeetupParty,
  type MirrorMessage,
  type Party,
  type RaidParty,
  type TrainAtEnd,
  type TrainParty,
} from './party.js';
import { PartyStatus } from './status.js';

/** A raid with everything a state document can hold. */
function fullRaid(): RaidParty {
  const raid = withAttendees(
    testRaid({ boss: { key: 'yveltal' }, fastMove: 'SNARL_FAST', anonymous: true }),
    {
      [ALICE]: {
        status: PartyStatus.CompletePending,
        pendingUntil: PARTY_NOW + 300_000,
        number: 3,
        remote: true,
      },
      [BOB]: { status: PartyStatus.Complete, group: 'B', name: 'Bob', team: 'valor' },
    },
  );
  return {
    ...raid,
    groups: [
      {
        id: 'A',
        label: 'park side',
        startTime: PARTY_NOW + 600_000,
        startClearTime: PARTY_NOW + 1_200_000,
      },
      { id: 'B' },
    ],
    defaultGroupId: 'B',
    prompts: {
      completion: [{ id: '300000000000000003', members: [ALICE, BOB] }],
      warning: '300000000000000004',
    },
    mirrorMessages: [
      { channelId: '300000000000000001', messageId: '300000000000000002', kind: 'remote' },
    ],
    raid: { ...raid.raid, hatchedDuration: 90, stageSeen: 'hatched' },
  };
}

/**
 * The document of a party as a version before 14 wrote it, but for its version number: a train
 * without its kind, its route and the stop it was finished from as gym ids (plan 8X-4).
 */
function oldState(party: Party) {
  const state = partyState(party);
  if (!state.train) return state;
  const { kind: _kind, route, finishedFrom, ...rest } = state.train;
  return {
    ...state,
    train: {
      ...rest,
      route: route.map((ref) => ref.id),
      finishedFrom: finishedFrom === null ? null : finishedFrom.id,
    },
  };
}

function columnsOf(party: Party): PartyColumns {
  const {
    anonymous: _a,
    attendees: _b,
    groups: _c,
    defaultGroupId: _d,
    prompts: _f,
    makerName: _g,
    ...rest
  } = party;
  // The parts of its kind (`raid`, `timed`, `meetup`, `train`) are in the document, not in a
  // column.
  const columns = Object.fromEntries(
    Object.entries(rest).filter(
      ([key]) => !['raid', 'timed', 'meetup', 'train', 'max'].includes(key),
    ),
  ) as PartyColumns;
  return { ...columns, mirrorMessages: [] };
}

/** A PokéStop as a meetup keeps it: what it was when it was named. */
const STOP: KnownPlace = {
  kind: 'stop',
  id: '0123456789abcdef0123456789abcdef.16',
  title: 'Fountain Square',
  lat: 40.0601,
  lon: -80.0601,
  address: '20 Market Street, Pinewood',
  image: 'https://lh3.googleusercontent.com/square',
};

/** A meetup with everything a state document can hold for one. */
function fullMeetup(): MeetupParty {
  const meetup = withAttendees(testMeetup(), {
    [ALICE]: {
      status: PartyStatus.Present,
      number: 3,
      remote: true,
      name: 'Alice',
      team: 'mystic',
    },
  });
  return {
    ...meetup,
    endTime: PARTY_NOW + 7_200_000,
    lastPossibleTime: PARTY_NOW + 7_200_000,
    prompts: { completion: [], warning: '300000000000000004' },
    mirrorMessages: [
      { channelId: '300000000000000001', messageId: '300000000000000002', kind: 'status' },
    ],
    timed: { name: 'Community Day picnic', startTime: PARTY_NOW + 3_600_000 },
    meetup: {
      description: 'Bring snacks.\nWe meet at the fountain.',
      place: STOP,
    },
  };
}

/**
 * What MySQL hands back for a JSON column: the document, parsed, with the keys of every object
 * sorted (MySQL keeps them by length, then by bytes).
 */
function stored(value: unknown): unknown {
  const sortKeys = (_key: string, part: unknown): unknown =>
    part !== null && typeof part === 'object' && !Array.isArray(part)
      ? Object.fromEntries(
          Object.entries(part).sort(
            ([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
          ),
        )
      : part;
  return JSON.parse(JSON.stringify(value), sortKeys);
}

describe('party state', () => {
  it('comes back from storage exactly as it went in', () => {
    const raid = fullRaid();
    const back = partyFromStored(
      columnsOf(raid),
      stored(partyState(raid)),
      stored(raid.mirrorMessages),
    );
    expect(back).toEqual({ ok: true, party: raid });
  });

  it('reads the groups in letter order, as a party keeps them since plan 8X-G', () => {
    const raid = fullRaid();
    const document = stored(partyState(raid)) as { groups: { id: string }[] };
    // Stored before 8X-G: a letter given again (A) after the groups opened before it.
    const old = { ...document, groups: [...document.groups].reverse() };
    const back = partyFromStored(columnsOf(raid), old, stored(raid.mirrorMessages));
    expect(raid.groups.length).toBeGreaterThan(1);
    expect(back.ok && back.party.groups.map((group) => group.id)).toEqual(
      raid.groups.map((group) => group.id),
    );
  });

  it('reads a raid that was stored with the EX tier as an elite raid, at any version', () => {
    const raid = fullRaid();
    const document = stored(partyState(raid)) as { v: number; raid: { tier: object } };
    const asEx = { ...document, raid: { ...document.raid, tier: { level: 'EX', shadow: false } } };
    const back = partyFromStored(columnsOf(raid), asEx, stored(raid.mirrorMessages));
    expect(back).toEqual({
      ok: true,
      party: { ...raid, raid: { ...raid.raid, tier: { level: 'Elite', shadow: false } } },
    });
    // Nothing was added to the document for it: the version is what it was.
    expect(document.v).toBe(15);
    // There were no shadow EX raids, and there are no shadow elite raids: still refused.
    const shadow = { ...document, raid: { ...document.raid, tier: { level: 'EX', shadow: true } } };
    expect(partyFromStored(columnsOf(raid), shadow, stored(raid.mirrorMessages))).toMatchObject({
      ok: false,
    });
    // A level nobody knows is still a row this version cannot read.
    const odd = { ...document, raid: { ...document.raid, tier: { level: 'T9', shadow: false } } };
    expect(partyFromStored(columnsOf(raid), odd, stored(raid.mirrorMessages))).toMatchObject({
      ok: false,
    });
  });

  it('stores the version, and neither the columns nor a name for a known boss', () => {
    const state = partyState(fullRaid());
    expect(state.v).toBe(15);
    expect(Object.keys(state).sort()).toEqual([
      'anonymous',
      'attendees',
      'defaultGroupId',
      'groups',
      'prompts',
      'raid',
      'v',
    ]);
    expect(state.raid?.boss).toEqual({ key: 'yveltal' });
  });

  it('keeps the attendees in the order they signed up, whatever their snowflakes', () => {
    // Later sign-ups with smaller snowflakes, which a JSON object in MySQL would sort first.
    const raid = withAttendees(testRaid(), { [BOB]: {}, [ALICE]: {}, '100000000000000009': {} });
    const order = Object.keys(raid.attendees);
    expect(order).toEqual([REPORTER, BOB, ALICE, '100000000000000009']);
    const back = partyFromStored(columnsOf(raid), stored(partyState(raid)), []);
    expect(back.ok && Object.keys(back.party.attendees)).toEqual(order);
  });

  it('keeps the screenshot of a raid, and reads a version 7 document as a raid without one', () => {
    const plain = testRaid();
    const raid = {
      ...plain,
      raid: { ...plain.raid, screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: true } },
    };
    const back = partyFromStored(columnsOf(raid), stored(partyState(raid)), []);
    expect(back).toEqual({ ok: true, party: raid });
    const v7 = stored(partyState(plain)) as { v: number; raid: Record<string, unknown> };
    const { screenshot: _none, ...older } = v7.raid;
    expect(partyFromStored(columnsOf(plain), { ...v7, v: 7, raid: older }, [])).toEqual({
      ok: true,
      party: plain,
    });
    const odd = {
      ...plain,
      raid: { ...plain.raid, screenshot: { id: '../x', timeUncertain: false } },
    };
    expect(() => partyState(odd)).toThrow(/cannot be stored/);
  });

  it('keeps a boss known only by the name of the feed', () => {
    const raid = testRaid({ boss: { name: 'Newmon' } });
    const back = partyFromStored(columnsOf(raid), stored(partyState(raid)), []);
    expect(back).toMatchObject({ ok: true, party: { raid: { boss: { name: 'Newmon' } } } });
  });

  it('reports a row it cannot read instead of guessing', () => {
    const raid = fullRaid();
    const state = stored(partyState(raid)) as Record<string, unknown>;
    const columns = columnsOf(raid);
    const problem = (s: unknown, c: PartyColumns = columns, m: unknown = []): string => {
      const result = partyFromStored(c, s, m);
      return result.ok ? 'read' : result.problem;
    };
    expect(problem(state, { ...columns, type: 'carnival' })).toBe('a party of type "carnival"');
    expect(problem(state, { ...columns, type: 'train' })).toBe(
      'a train without its name and start',
    );
    expect(problem({ ...state, v: 16 })).toMatch(/^state: /);
    expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
    expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
      /^state: /,
    );
    expect(problem('{}')).toMatch(/^state: /);
    expect(problem(null)).toMatch(/^state: /);
    expect(problem({ ...state, raid: undefined })).toBe('a raid without its raid details');
    expect(problem({ ...state, defaultGroupId: 'C' })).toMatch(/default group/);
    expect(problem({ ...state, groups: [] })).toMatch(/^state: /);
    expect(
      problem({
        ...state,
        attendees: [{ id: 'nobody', number: 1, status: 1, group: 'A', remote: false }],
      }),
    ).toMatch(/^state: /);
    expect(
      problem({
        ...state,
        attendees: [{ id: ALICE, number: 0, status: 1, group: 'A', remote: false }],
      }),
    ).toMatch(/^state: /);
    expect(
      problem({
        ...state,
        attendees: [{ id: ALICE, number: 1, status: -1, group: 'A', remote: false }],
      }),
    ).toMatch(/^state: /);
    const alice = { id: ALICE, number: 1, status: 1, group: 'A', remote: false };
    expect(problem({ ...state, attendees: [alice, alice] })).toMatch(/listed twice/);
    expect(problem({ ...state, attendees: { [ALICE]: alice } })).toMatch(/^state: /);
    expect(
      problem({
        ...state,
        raid: { ...(state.raid as object), tier: { level: 'Mega', shadow: true } },
      }),
    ).toMatch(/shadow/);
    expect(problem(state, columns, [{ channelId: 'x', messageId: '1', kind: 'ex' }])).toMatch(
      /^mirrorMessages: /,
    );
    expect(problem(state, columns, null)).toMatch(/^mirrorMessages: /);
    const failed = partyFromStored({ ...columns, type: 'meetup' }, state, []);
    expect(failed).toMatchObject({ ok: false, id: raid.id });
  });

  it('brings a meetup back from storage exactly as it went in', () => {
    const meetup = fullMeetup();
    const back = partyFromStored(
      columnsOf(meetup),
      stored(partyState(meetup)),
      stored(meetup.mirrorMessages),
    );
    expect(back).toEqual({ ok: true, party: meetup });
  });

  it('stores the parts of a meetup in the place of that of a raid', () => {
    const state = partyState(fullMeetup());
    expect(Object.keys(state).sort()).toEqual([
      'anonymous',
      'attendees',
      'defaultGroupId',
      'groups',
      'meetup',
      'prompts',
      'timed',
      'v',
    ]);
    // What a train will have too, and what only a meetup has.
    expect(state.timed).toEqual({ name: 'Community Day picnic', startTime: PARTY_NOW + 3_600_000 });
    expect(state.meetup).toEqual({
      description: 'Bring snacks.\nWe meet at the fountain.',
      place: STOP,
    });
    // A meetup that was just made: no description, no place, no start.
    const fresh = partyState(testMeetup());
    expect(fresh.timed).toEqual({ name: 'Community Day picnic', startTime: null });
    expect(fresh.meetup).toEqual({ description: null, place: null });
  });

  it('keeps every kind of place of a meetup, and reads a version 9 meetup as one without', () => {
    const pins: DroppedPin[] = [
      { kind: 'pin', lat: 40.02, lon: -80.02, near: null, linkName: null },
      {
        kind: 'pin',
        lat: -33.8568,
        lon: 151.2153,
        near: { kind: 'powerspot', title: 'Library Garden' },
        linkName: 'Blue Tent',
      },
    ];
    const places: (MeetupParty['meetup']['place'] & object)[] = [
      STOP,
      { ...STOP, kind: 'gym', id: '12', address: null, image: null },
      ...pins,
    ];
    for (const place of places) {
      const meetup: MeetupParty = { ...fullMeetup(), meetup: { ...fullMeetup().meetup, place } };
      expect(partyFromStored(columnsOf(meetup), stored(partyState(meetup)), [])).toEqual({
        ok: true,
        party: { ...meetup, mirrorMessages: [] },
      });
    }
    // Version 9 knew no place: a meetup of it has none.
    const meetup = fullMeetup();
    const { place: _place, ...old } = partyState(meetup).meetup ?? {};
    expect(
      partyFromStored(
        columnsOf(meetup),
        stored({ ...oldState(meetup), v: 9, meetup: old }),
        meetup.mirrorMessages,
      ),
    ).toEqual({
      ok: true,
      party: { ...meetup, meetup: { ...meetup.meetup, place: null } },
    });
  });

  it('refuses a place no meetup can have, when read and when written', () => {
    const problem = (columns: PartyColumns, state: unknown): string => {
      const result = partyFromStored(columns, state, []);
      return result.ok ? 'read' : result.problem;
    };
    const meetup = fullMeetup();
    const state = stored(partyState(meetup)) as Record<string, unknown>;
    const withPlace = (place: unknown): string =>
      problem(columnsOf(meetup), { ...state, meetup: { ...meetup.meetup, place } });
    expect(withPlace(null)).toBe('read');
    expect(withPlace({ ...STOP, lat: 91 })).toMatch(/^state: /);
    expect(withPlace({ ...STOP, kind: 'portal' })).toMatch(/^state: /);
    expect(withPlace({ kind: 'pin', lat: 40, lon: -80, near: null })).toMatch(/^state: /);
    expect(withPlace({ ...STOP, image: '' })).toMatch(/^state: /);
    // Version 10 needs it: a document without it is damaged, not old.
    const { place: _place, ...withoutPlace } = meetup.meetup;
    expect(problem(columnsOf(meetup), { ...state, meetup: withoutPlace })).toMatch(/^state: /);
    expect(() =>
      partyState({ ...meetup, meetup: { ...meetup.meetup, place: { ...STOP, lon: 181 } } }),
    ).toThrow(/cannot be stored/);
  });

  it('reports a row whose document is not of the kind its type says', () => {
    const raid = fullRaid();
    const meetup = fullMeetup();
    const raidState = stored(partyState(raid)) as Record<string, unknown>;
    const meetupState = stored(partyState(meetup)) as Record<string, unknown>;
    const problem = (columns: PartyColumns, state: unknown): string => {
      const result = partyFromStored(columns, state, []);
      return result.ok ? 'read' : result.problem;
    };
    expect(problem(columnsOf(meetup), raidState)).toBe('a meetup without its name and start');
    expect(problem(columnsOf(raid), meetupState)).toBe('a raid without its raid details');
    const { timed, meetup: details } = meetupState;
    expect(problem(columnsOf(meetup), { ...meetupState, timed: undefined })).toBe(
      'a meetup without its name and start',
    );
    expect(problem(columnsOf(meetup), { ...meetupState, meetup: undefined })).toBe(
      'a meetup without its meetup details',
    );
    expect(problem(columnsOf(raid), { ...raidState, timed })).toBe(
      'a raid with a name and a start of its own',
    );
    expect(problem(columnsOf(raid), { ...raidState, meetup: details })).toBe(
      'a raid with the details of a meetup',
    );
    expect(problem(columnsOf(meetup), { ...raidState, timed, meetup: details })).toBe(
      'a meetup with the details of a raid',
    );
    // What only a raid has in its columns.
    expect(problem({ ...columnsOf(meetup), gymId: 1 }, meetupState)).toBe('a meetup with a gym');
    expect(problem({ ...columnsOf(meetup), hatchTime: PARTY_NOW }, meetupState)).toBe(
      'a meetup with a hatch time',
    );
    expect(problem({ ...columnsOf(meetup), type: 'train' }, meetupState)).toBe(
      'a train without its train details',
    );
    expect(problem({ ...columnsOf(meetup), type: 'carnival' }, meetupState)).toBe(
      'a party of type "carnival"',
    );
  });

  it('refuses the details of a meetup that no meetup can have', () => {
    const meetup = fullMeetup();
    const state = stored(partyState(meetup)) as Record<string, unknown>;
    const problem = (timed: object, details: object = {}): string => {
      const result = partyFromStored(
        columnsOf(meetup),
        {
          ...state,
          timed: { ...meetup.timed, ...timed },
          meetup: { ...meetup.meetup, ...details },
        },
        [],
      );
      return result.ok ? 'read' : result.problem;
    };
    expect(problem({})).toBe('read');
    expect(problem({ name: '' })).toMatch(/^state: /);
    expect(problem({ name: 'x'.repeat(MAX_PARTY_NAME) })).toBe('read');
    expect(problem({ name: 'x'.repeat(MAX_PARTY_NAME + 1) })).toMatch(/^state: /);
    expect(problem({ startTime: 1.5 })).toMatch(/^state: /);
    expect(problem({ startTime: undefined })).toMatch(/^state: /);
    expect(problem({}, { description: '' })).toMatch(/^state: /);
    expect(problem({}, { description: 'x'.repeat(MAX_MEETUP_DESCRIPTION) })).toBe('read');
    expect(problem({}, { description: 'x'.repeat(MAX_MEETUP_DESCRIPTION + 1) })).toMatch(
      /^state: /,
    );
  });

  it('reads a version 3 document, which is always a raid', () => {
    const raid = fullRaid();
    const old = stored({ ...oldState(raid), v: 3 });
    expect(partyFromStored(columnsOf(raid), old, stored(raid.mirrorMessages))).toEqual({
      ok: true,
      party: raid,
    });
    // Version 3 knew no meetups: such a row is not read as one.
    const meetup = fullMeetup();
    const impossible = stored({ ...oldState(meetup), v: 3 });
    expect(partyFromStored(columnsOf(meetup), impossible, [])).toEqual({
      ok: false,
      id: meetup.id,
      problem: 'a meetup without its name and start',
    });
  });

  it('reads a version 1 document as a party without names, teams and prompts', () => {
    const raid = withAttendees(testRaid(), { [ALICE]: { number: 2 } });
    const { prompts: _prompts, ...rest } = partyState(raid);
    const old = stored({ ...rest, v: 1 });
    expect(partyFromStored(columnsOf(raid), old, [])).toEqual({ ok: true, party: raid });
    // What version 1 did not have is not read from a version 1 document.
    const named = stored({
      ...rest,
      v: 1,
      attendees: rest.attendees.map((attendee) => ({ ...attendee, team: 'valor' })),
      prompts: { completion: ['300000000000000003'], warning: null },
    });
    expect(partyFromStored(columnsOf(raid), named, [])).toEqual({ ok: true, party: raid });
    const broken = stored({ ...rest, v: 1, defaultGroupId: 'C' });
    const failed = partyFromStored(columnsOf(raid), broken, []);
    expect(failed.ok ? 'read' : failed.problem).toMatch(/default group/);
  });

  it('reads a version 2 document: its questions asked nobody in particular', () => {
    const raid = withAttendees(testRaid(), {
      [ALICE]: { status: PartyStatus.CompletePending, pendingUntil: PARTY_NOW, name: 'Alice' },
    });
    const { prompts: _prompts, ...rest } = partyState(raid);
    const old = stored({
      ...rest,
      v: 2,
      prompts: { completion: ['300000000000000003'], warning: '300000000000000004' },
    });
    expect(partyFromStored(columnsOf(raid), old, [])).toEqual({
      ok: true,
      party: {
        ...raid,
        prompts: {
          completion: [{ id: '300000000000000003', members: [] }],
          warning: '300000000000000004',
        },
      },
    });
    // What version 2 did not have is not read from a version 2 document.
    const asked = stored({
      ...rest,
      v: 2,
      attendees: rest.attendees.map((attendee) => ({ ...attendee, askedBy: BOB })),
      prompts: { completion: [], warning: null },
    });
    expect(partyFromStored(columnsOf(raid), asked, [])).toEqual({ ok: true, party: raid });
    // A version 3 list of questions in a document that says 2 is not read as either.
    const mixed = stored({ ...rest, v: 2, prompts: partyState(fullRaid()).prompts });
    const failed = partyFromStored(columnsOf(raid), mixed, []);
    expect(failed.ok ? 'read' : failed.problem).toMatch(/^state: /);
  });

  it('keeps who asked an attendee, and refuses an asker that is no snowflake', () => {
    const raid = withAttendees(testRaid(), {
      [ALICE]: { status: PartyStatus.CompletePending, pendingUntil: PARTY_NOW, askedBy: BOB },
    });
    const state = partyState(raid);
    expect(partyFromStored(columnsOf(raid), stored(state), [])).toEqual({ ok: true, party: raid });
    const broken = stored({
      ...state,
      attendees: state.attendees.map((attendee) => ({ ...attendee, askedBy: 'bob' })),
    });
    expect(partyFromStored(columnsOf(raid), broken, []).ok).toBe(false);
  });

  it('refuses a team or a name it does not know how to show', () => {
    const raid = fullRaid();
    const state = partyState(raid);
    const withFirst = (change: object): unknown =>
      stored({
        ...state,
        attendees: state.attendees.map((a, i) => (i === 0 ? { ...a, ...change } : a)),
      });
    const read = (document: unknown) => partyFromStored(columnsOf(raid), document, []).ok;
    expect(read(withFirst({ team: 'harmony' }))).toBe(false);
    expect(read(withFirst({ name: '' }))).toBe(false);
    expect(read(withFirst({ name: 'x'.repeat(33) }))).toBe(false);
    expect(read(withFirst({ name: 'x'.repeat(32), team: 'mystic' }))).toBe(true);
  });

  it('refuses a document with two groups of the same id, or an attendee in a group that is not there', () => {
    const raid = fullRaid();
    const state = stored(partyState(raid)) as Record<string, unknown>;
    const columns = columnsOf(raid);
    const twice = partyFromStored(columns, { ...state, groups: [{ id: 'A' }, { id: 'A' }] }, []);
    expect(twice.ok ? 'read' : twice.problem).toMatch(/group.*twice/);
    // fullRaid has Bob in group B; take group B away.
    const missing = partyFromStored(
      columns,
      { ...state, groups: [{ id: 'A' }], defaultGroupId: 'A' },
      [],
    );
    expect(missing.ok ? 'read' : missing.problem).toMatch(/not one of the groups/);
  });
});

describe('writing a party state', () => {
  it('throws, naming the party, for a party that could not be read back', () => {
    const raid = fullRaid();
    const fractional: RaidParty = {
      ...raid,
      attendees: {
        ...raid.attendees,
        [ALICE]: {
          number: 1,
          status: PartyStatus.CompletePending,
          group: 'A',
          remote: false,
          pendingUntil: 1.5,
        },
      },
    };
    expect(() => partyState(fractional)).toThrow(raid.id);
    expect(() => partyState(fractional)).toThrow(/pendingUntil/);
  });

  it('throws for a default group that is not among the groups', () => {
    const raid = fullRaid();
    expect(() => partyState({ ...raid, defaultGroupId: 'C' })).toThrow(/default group/);
  });

  it('throws for two groups of the same id, and for an attendee in a group that is not there', () => {
    const raid = fullRaid();
    expect(() => partyState({ ...raid, groups: [{ id: 'A' }, { id: 'A' }, { id: 'B' }] })).toThrow(
      /twice/,
    );
    expect(() => partyState({ ...raid, groups: [{ id: 'A' }], defaultGroupId: 'A' })).toThrow(
      /not one of the groups/,
    );
  });

  it('writes nothing outside the schema: a boss object with more than its reference', () => {
    const raid = fullRaid();
    const bloated = {
      ...raid,
      raid: { ...raid.raid, boss: { key: 'yveltal', entry: { huge: true } } },
    } as unknown as RaidParty;
    const document = partyState(bloated);
    expect(document.raid?.boss).toEqual({ key: 'yveltal' });
    expect(JSON.stringify(document)).not.toContain('huge');
  });

  it('partyMirrors returns the list, and throws for a mirror the reader would refuse', () => {
    const mirror = { channelId: '300000000000000001', messageId: '300000000000000002', kind: 'ex' };
    const raid = { ...testRaid(), mirrorMessages: [mirror as MirrorMessage] };
    expect(partyMirrors(raid)).toEqual([mirror]);
    const bad = { ...raid, mirrorMessages: [{ ...mirror, messageId: 'abc' } as MirrorMessage] };
    expect(() => partyMirrors(bad)).toThrow(raid.id);
    expect(() => partyMirrors(bad)).toThrow(/messageId/);
  });

  it('knows the copy of the message that /status puts into the post itself', () => {
    const status = { channelId: '300000000000000009', messageId: '300000000000000003' };
    const raid = { ...testRaid(), mirrorMessages: [{ ...status, kind: 'status' as const }] };
    expect(partyMirrors(raid)).toEqual([{ ...status, kind: 'status' }]);
    const unknown = { ...raid, mirrorMessages: [{ ...status, kind: 'pinned' } as never] };
    expect(() => partyMirrors(unknown)).toThrow(/kind/);
  });

  it('accepts every party the readers can read', () => {
    expect(() => partyState(fullRaid())).not.toThrow();
    expect(() => partyState(testRaid())).not.toThrow();
    expect(() => partyState(fullMeetup())).not.toThrow();
    expect(() => partyState(testMeetup())).not.toThrow();
  });

  it('throws for a meetup whose name could not be read back', () => {
    const meetup = fullMeetup();
    const nameless: MeetupParty = { ...meetup, timed: { ...meetup.timed, name: '' } };
    expect(() => partyState(nameless)).toThrow(meetup.id);
    expect(() => partyState(nameless)).toThrow(/name/);
  });
});

/** A train with everything a state document can hold for one. */
function fullTrain(): TrainParty {
  const train = withAttendees(testTrain(), {
    [ALICE]: {
      status: PartyStatus.Present,
      number: 2,
      remote: true,
      name: 'Alice',
      team: 'mystic',
    },
    [BOB]: { group: 'B' },
  });
  return {
    ...train,
    forumChannelId: '300000000000000010',
    forumPostId: '300000000000000011',
    endTime: PARTY_NOW + 7_200_000,
    lastPossibleTime: PARTY_NOW + 7_200_000,
    groups: [{ id: 'A', label: 'drivers' }, { id: 'B' }],
    defaultGroupId: 'B',
    prompts: { completion: [], warning: '300000000000000004' },
    timed: { ...train.timed, startTime: PARTY_NOW + 3_600_000 },
    train: {
      kind: 'raid',
      route: stops(4, 1, 7),
      stop: 1,
      finishedFrom: null,
      atEnd: 'finish',
      conductorId: ALICE,
      boss: { key: 'yveltal' },
      splitFrom: null,
      splitOff: [],
    },
  };
}

describe('the state of a train', () => {
  const problem = (columns: PartyColumns, state: unknown): string => {
    const result = partyFromStored(columns, state, []);
    return result.ok ? 'read' : result.problem;
  };

  it('brings a train back from storage exactly as it went in', () => {
    const train = fullTrain();
    const back = partyFromStored(columnsOf(train), stored(partyState(train)), []);
    expect(back).toEqual({ ok: true, party: train });
    // One that was just made: no route, no conductor, no boss.
    const fresh = testTrain();
    expect(partyFromStored(columnsOf(fresh), stored(partyState(fresh)), [])).toEqual({
      ok: true,
      party: fresh,
    });
  });

  it('stores the parts of a train: what every timed party has, and its own', () => {
    const state = partyState(fullTrain());
    expect(Object.keys(state).sort()).toEqual([
      'anonymous',
      'attendees',
      'defaultGroupId',
      'groups',
      'prompts',
      'timed',
      'train',
      'v',
    ]);
    expect(state.timed).toEqual({ name: 'Saturday legendaries', startTime: PARTY_NOW + 3_600_000 });
    expect(state.train).toEqual({
      kind: 'raid',
      route: stops(4, 1, 7),
      stop: 1,
      finishedFrom: null,
      atEnd: 'finish',
      conductorId: ALICE,
      boss: { key: 'yveltal' },
      splitFrom: null,
      splitOff: [],
    });
    expect(partyState(testTrain()).train).toEqual({
      kind: 'raid',
      route: [],
      stop: 0,
      finishedFrom: null,
      atEnd: 'finish',
      conductorId: null,
      boss: null,
      splitFrom: null,
      splitOff: [],
    });
  });

  it('keeps a finished route, and a boss known only by the name of the feed', () => {
    const train: TrainParty = {
      ...fullTrain(),
      train: {
        kind: 'raid',
        route: stops(4, 1, 7),
        stop: 3,
        finishedFrom: null,
        atEnd: 'finish',
        conductorId: null,
        boss: { name: 'Newmon' },
        splitFrom: null,
        splitOff: [],
      },
    };
    expect(partyFromStored(columnsOf(train), stored(partyState(train)), [])).toEqual({
      ok: true,
      party: train,
    });
  });

  it('keeps the stop a route was finished from, and only on a finished route that has that gym', () => {
    const train = fullTrain();
    const finished: TrainParty = {
      ...train,
      train: { ...train.train, stop: 3, finishedFrom: gym(1) },
    };
    expect(partyState(finished).train).toMatchObject({ stop: 3, finishedFrom: gym(1) });
    expect(partyFromStored(columnsOf(finished), stored(partyState(finished)), [])).toEqual({
      ok: true,
      party: finished,
    });
    const state = stored(partyState(finished)) as Record<string, unknown>;
    const withTrain = (details: object): string =>
      problem(columnsOf(train), { ...state, train: { ...finished.train, ...details } });
    expect(withTrain({})).toBe('read');
    expect(withTrain({ finishedFrom: null })).toBe('read');
    expect(withTrain({ stop: 2 })).toMatch(/a route that is not finished remembers where it was/);
    expect(withTrain({ finishedFrom: gym(9) })).toMatch(/finished from a stop that is not on it/);
    expect(withTrain({ finishedFrom: gym(0) })).toMatch(/^state: /);
    expect(withTrain({ finishedFrom: '1' })).toMatch(/^state: /);
    expect(withTrain({ finishedFrom: undefined })).toMatch(/^state: /);
    expect(withTrain({ route: [], stop: 0 })).toMatch(/not finished/);
    // Such a train is never written either.
    expect(() =>
      partyState({ ...train, train: { ...train.train, stop: 1, finishedFrom: gym(4) } }),
    ).toThrow(/cannot be stored/);
    expect(() =>
      partyState({ ...train, train: { ...train.train, stop: 3, finishedFrom: gym(9) } }),
    ).toThrow(/cannot be stored/);
  });

  it('reads a version 5 document as a train that remembers no stop it finished from', () => {
    const train = fullTrain();
    const { finishedFrom: _finishedFrom, ...details } = oldState(train).train ?? {};
    const old = stored({ ...oldState(train), v: 5, train: details });
    expect(partyFromStored(columnsOf(train), old, [])).toEqual({ ok: true, party: train });
    // Also one on a finished route: Previous leads to its last stop, as it did.
    const finished: TrainParty = { ...train, train: { ...train.train, stop: 3 } };
    const oldFinished = stored({ ...oldState(finished), v: 5, train: { ...details, stop: 3 } });
    expect(partyFromStored(columnsOf(finished), oldFinished, [])).toEqual({
      ok: true,
      party: finished,
    });
    // What version 5 did not know is not read from it.
    expect(problem(columnsOf(finished), stored({ ...oldState(finished), v: 5 }))).toBe('read');
    const sneaked = partyFromStored(
      columnsOf(finished),
      stored({
        ...partyState(finished),
        v: 5,
        train: { ...details, stop: 3, finishedFrom: gym(1) },
      }),
      [],
    );
    expect(sneaked).toEqual({ ok: true, party: finished });
    // A raid and a meetup of version 5 are read as they are.
    const meetup = testMeetup();
    expect(partyFromStored(columnsOf(meetup), stored({ ...oldState(meetup), v: 5 }), [])).toEqual({
      ok: true,
      party: meetup,
    });
    const raid = fullRaid();
    expect(
      partyFromStored(columnsOf(raid), stored({ ...oldState(raid), v: 5 }), raid.mirrorMessages),
    ).toEqual({ ok: true, party: raid });
    // A damaged one is reported.
    expect(
      problem(
        columnsOf(train),
        stored({ ...oldState(train), v: 5, train: { ...details, stop: 9 } }),
      ),
    ).toMatch(/the train is at a stop beyond its route/);
  });

  it('reports a row whose document is not that of a train', () => {
    const train = fullTrain();
    const state = stored(partyState(train)) as Record<string, unknown>;
    const meetupState = stored(partyState(testMeetup())) as Record<string, unknown>;
    const raidState = stored(partyState(testRaid())) as Record<string, unknown>;
    expect(problem(columnsOf(train), state)).toBe('read');
    expect(problem(columnsOf(train), { ...state, train: undefined })).toBe(
      'a train without its train details',
    );
    expect(problem(columnsOf(train), { ...state, timed: undefined })).toBe(
      'a train without its name and start',
    );
    expect(problem(columnsOf(train), { ...state, meetup: meetupState.meetup })).toBe(
      'a train with the details of a meetup',
    );
    expect(problem(columnsOf(train), { ...state, raid: raidState.raid })).toBe(
      'a train with the details of a raid',
    );
    expect(problem(columnsOf(testMeetup()), { ...meetupState, train: state.train })).toBe(
      'a meetup with the details of a train',
    );
    expect(problem(columnsOf(testRaid()), { ...raidState, train: state.train })).toBe(
      'a raid with the details of a train',
    );
    // The gym of a train is the stop it is at: the column of a raid stays empty.
    expect(problem({ ...columnsOf(train), gymId: 4 }, state)).toBe('a train with a gym');
    expect(problem({ ...columnsOf(train), hatchTime: PARTY_NOW }, state)).toBe(
      'a train with a hatch time',
    );
  });

  it('refuses the details of a train that no train can have, when read and when written', () => {
    const train = fullTrain();
    const state = stored(partyState(train)) as Record<string, unknown>;
    const withTrain = (details: object): string =>
      problem(columnsOf(train), { ...state, train: { ...train.train, ...details } });
    expect(withTrain({})).toBe('read');
    expect(withTrain({ route: stops(4, 1, 4) })).toMatch(/a stop is on the route twice/);
    expect(withTrain({ route: [4, 1.5] })).toMatch(/^state: /);
    expect(withTrain({ route: stops(0) })).toMatch(/^state: /);
    expect(withTrain({ route: ['4'] })).toMatch(/^state: /);
    expect(withTrain({ stop: 4 })).toMatch(/the train is at a stop beyond its route/);
    expect(withTrain({ stop: -1 })).toMatch(/^state: /);
    expect(withTrain({ route: [], stop: 1 })).toMatch(/beyond its route/);
    expect(withTrain({ route: [], stop: 0 })).toBe('read');
    expect(withTrain({ conductorId: 'Alice' })).toMatch(/^state: /);
    expect(withTrain({ conductorId: undefined })).toMatch(/^state: /);
    expect(withTrain({ boss: {} })).toMatch(/^state: /);
    const fifty = Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => index + 1);
    expect(withTrain({ route: stops(...fifty) })).toBe('read');
    expect(withTrain({ route: stops(...fifty, 51) })).toMatch(/^state: /);
    // Such a train is never written either.
    expect(() => partyState({ ...train, train: { ...train.train, route: stops(4, 4) } })).toThrow(
      /cannot be stored/,
    );
    expect(() => partyState({ ...train, train: { ...train.train, stop: 9 } })).toThrow(
      /cannot be stored/,
    );
  });

  it('keeps the name of who made the party, and reads a version 6 document without one', () => {
    const raid = { ...fullRaid(), makerName: 'Rae the Reporter' };
    const state = partyState(raid);
    expect(state.makerName).toBe('Rae the Reporter');
    expect(partyFromStored(columnsOf(raid), stored(state), raid.mirrorMessages)).toEqual({
      ok: true,
      party: raid,
    });
    // A party without the name has no such key in its document.
    expect(partyState(fullRaid())).not.toHaveProperty('makerName');
    // Version 6 did not know the name: its documents are read without one, whatever they say.
    for (const party of [fullRaid(), testMeetup(), fullTrain()]) {
      const old = stored({ ...oldState(party), v: 6, makerName: 'Somebody' });
      expect(partyFromStored(columnsOf(party), old, party.mirrorMessages)).toEqual({
        ok: true,
        party,
      });
    }
    // A name the reader would refuse is never written.
    expect(() => partyState({ ...fullRaid(), makerName: '' })).toThrow(/cannot be stored/);
    expect(() => partyState({ ...fullRaid(), makerName: 'x'.repeat(33) })).toThrow(
      /cannot be stored/,
    );
  });

  it('keeps what a train does at the end of its route, and reads a version 8 train as one that finishes', () => {
    for (const atEnd of TRAIN_AT_END) {
      const train: TrainParty = { ...fullTrain(), train: { ...fullTrain().train, atEnd } };
      expect(partyState(train).train?.atEnd).toBe(atEnd);
      expect(partyFromStored(columnsOf(train), stored(partyState(train)), [])).toEqual({
        ok: true,
        party: train,
      });
      // Version 8 did not know the mode: what such a document says of one is not read.
      const { atEnd: _mode, ...details } = oldState(train).train ?? {};
      for (const old of [details, { ...details, atEnd }]) {
        expect(
          partyFromStored(columnsOf(train), stored({ ...oldState(train), v: 8, train: old }), []),
        ).toEqual({ ok: true, party: { ...train, train: { ...train.train, atEnd: 'finish' } } });
      }
    }
    // A raid of version 8 is read as it is, a meetup as one without a place.
    const raid = fullRaid();
    expect(
      partyFromStored(columnsOf(raid), stored({ ...oldState(raid), v: 8 }), raid.mirrorMessages),
    ).toEqual({ ok: true, party: raid });
    const meetup = fullMeetup();
    const { description } = meetup.meetup;
    expect(
      partyFromStored(
        columnsOf(meetup),
        stored({ ...oldState(meetup), v: 8, meetup: { description } }),
        meetup.mirrorMessages,
      ),
    ).toEqual({
      ok: true,
      party: { ...meetup, meetup: { description, place: null } },
    });
    // A damaged version 8 train is reported as before.
    const train = fullTrain();
    const { atEnd: _mode, ...details } = oldState(train).train ?? {};
    expect(
      problem(
        columnsOf(train),
        stored({ ...oldState(train), v: 8, train: { ...details, stop: 9 } }),
      ),
    ).toMatch(/the train is at a stop beyond its route/);
  });

  it('refuses a mode it does not know, and a train of version 9 without one', () => {
    const train = fullTrain();
    const state = stored(partyState(train)) as Record<string, unknown>;
    const withTrain = (details: object): string =>
      problem(columnsOf(train), { ...state, train: { ...train.train, ...details } });
    expect(withTrain({ atEnd: 'loop' })).toBe('read');
    expect(withTrain({ atEnd: 'bounce' })).toMatch(/^state: /);
    expect(withTrain({ atEnd: undefined })).toMatch(/^state: /);
    expect(() =>
      partyState({ ...train, train: { ...train.train, atEnd: 'bounce' as TrainAtEnd } }),
    ).toThrow(/cannot be stored/);
  });

  it('keeps the trains a train was split from and off, and reads a version 10 train as one of neither', () => {
    const train = fullTrain();
    const split: TrainParty = {
      ...train,
      train: {
        ...train.train,
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
          {
            partyId: '00000000-0000-4000-8000-0000000000cc',
            postId: '300000000000000022',
            group: 'B',
          },
        ],
      },
    };
    expect(partyState(split).v).toBe(15);
    expect(partyFromStored(columnsOf(split), stored(partyState(split)), [])).toEqual({
      ok: true,
      party: split,
    });
    // A new train whose split is not settled yet says so, and only then.
    const pending: TrainParty = {
      ...split,
      train: {
        ...split.train,
        splitFrom: {
          partyId: '00000000-0000-4000-8000-0000000000aa',
          postId: '300000000000000020',
          pending: true,
        },
      },
    };
    expect(partyFromStored(columnsOf(pending), stored(partyState(pending)), [])).toEqual({
      ok: true,
      party: pending,
    });
    expect(partyState(split).train?.splitFrom).not.toHaveProperty('pending');
    // Version 10 knew no splits: what such a document says of them is not read.
    const { splitFrom: _from, splitOff: _off, ...details } = oldState(split).train ?? {};
    for (const old of [details, oldState(split).train]) {
      expect(
        partyFromStored(columnsOf(split), stored({ ...oldState(split), v: 10, train: old }), []),
      ).toEqual({ ok: true, party: train });
    }
    // A raid and a meetup of version 10 are read as they are.
    const meetup = fullMeetup();
    expect(
      partyFromStored(
        columnsOf(meetup),
        stored({ ...oldState(meetup), v: 10 }),
        meetup.mirrorMessages,
      ),
    ).toEqual({ ok: true, party: meetup });
  });

  it('refuses a split that no train can have, when read and when written', () => {
    const train = fullTrain();
    const state = stored(partyState(train)) as Record<string, unknown>;
    const withTrain = (details: object): string =>
      problem(columnsOf(train), { ...state, train: { ...train.train, ...details } });
    const off = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        partyId: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
        postId: `30000000000000003${i % 10}`,
        group: 'B',
      }));
    expect(withTrain({ splitOff: off(MAX_SPLITS_KEPT) })).toBe('read');
    expect(withTrain({ splitOff: off(MAX_SPLITS_KEPT + 1) })).toMatch(/^state: /);
    expect(withTrain({ splitOff: [{ ...off(1)[0], group: 'F' }] })).toMatch(/^state: /);
    expect(withTrain({ splitFrom: { partyId: 'x', postId: 'no post' } })).toMatch(/^state: /);
    expect(withTrain({ splitFrom: undefined })).toMatch(/^state: /);
    // A new train waits for the old one's write (`pending`): only `true` says so.
    const from = { partyId: '00000000-0000-4000-8000-0000000000aa', postId: '300000000000000020' };
    expect(withTrain({ splitFrom: { ...from, pending: true } })).toBe('read');
    expect(withTrain({ splitFrom: { ...from, pending: false } })).toMatch(/^state: /);
    expect(withTrain({ splitOff: undefined })).toMatch(/^state: /);
    expect(() =>
      partyState({ ...train, train: { ...train.train, splitFrom: { partyId: '', postId: '1' } } }),
    ).toThrow(/cannot be stored/);
  });

  it('keeps when each group was opened, and reads a version 11 document as groups opened with the party', () => {
    const raid: RaidParty = {
      ...fullRaid(),
      groups: [{ id: 'A' }, { id: 'C', label: 'Fast', opened: PARTY_NOW + 60_000 }],
      defaultGroupId: 'C',
      attendees: {},
      mirrorMessages: [],
    };
    expect(partyState(raid).v).toBe(15);
    expect(partyFromStored(columnsOf(raid), stored(partyState(raid)), [])).toEqual({
      ok: true,
      party: raid,
    });
    // Version 11 knew no stamps: what such a document says of one is not read.
    const old = stored({ ...oldState(raid), v: 11 });
    expect(partyFromStored(columnsOf(raid), old, [])).toEqual({
      ok: true,
      party: { ...raid, groups: [{ id: 'A' }, { id: 'C', label: 'Fast' }] },
    });
    // A stamp that is no time is refused.
    const state = stored(partyState(raid)) as Record<string, unknown>;
    expect(problem(columnsOf(raid), { ...state, groups: [{ id: 'A', opened: -1 }] })).toMatch(
      /^state: /,
    );
    // So is a group split off a train, which a stale dialog's mark is compared with.
    const train = fullTrain();
    const split: TrainParty = {
      ...train,
      train: {
        ...train.train,
        splitOff: [
          {
            partyId: '00000000-0000-4000-8000-0000000000bb',
            postId: '300000000000000021',
            group: 'C',
            opened: PARTY_NOW + 60_000,
          },
        ],
      },
    };
    expect(partyFromStored(columnsOf(split), stored(partyState(split)), [])).toEqual({
      ok: true,
      party: split,
    });
    const { opened: _opened, ...unstamped } = split.train.splitOff[0] ?? { opened: 0 };
    expect(partyFromStored(columnsOf(split), stored({ ...oldState(split), v: 11 }), [])).toEqual({
      ok: true,
      party: { ...split, train: { ...split.train, splitOff: [unstamped] } },
    });
  });

  // Review A of 8X-3, X3-B-7: version 13 added only `max`; what 8X-1B wrote reads as it was.
  it('reads a version 12 raid, train and meetup with their groups’ stamps as they were', () => {
    const stamped = [
      { id: 'A' as const },
      { id: 'B' as const, opened: PARTY_NOW + 30_000 },
      { id: 'C' as const, label: 'Fast', opened: PARTY_NOW + 60_000 },
    ];
    const raid: RaidParty = { ...fullRaid(), groups: stamped, defaultGroupId: 'C' };
    const train = fullTrain();
    const trainSplit: TrainParty = {
      ...train,
      groups: stamped,
      defaultGroupId: 'C',
      train: {
        ...train.train,
        splitOff: [
          {
            partyId: '00000000-0000-4000-8000-0000000000bb',
            postId: '300000000000000021',
            group: 'D',
            opened: PARTY_NOW + 45_000,
          },
        ],
      },
    };
    const meetup: MeetupParty = { ...fullMeetup(), groups: stamped, defaultGroupId: 'C' };
    for (const party of [raid, trainSplit, meetup] as Party[]) {
      const old = stored({ ...oldState(party), v: 12 });
      expect(partyFromStored(columnsOf(party), old, stored(party.mirrorMessages))).toEqual({
        ok: true,
        party,
      });
    }
  });

  it('reads a version 4 document, which is a raid or a meetup and never a train', () => {
    const meetup = testMeetup();
    const old = stored({ ...oldState(meetup), v: 4 });
    expect(partyFromStored(columnsOf(meetup), old, [])).toEqual({ ok: true, party: meetup });
    const raid = fullRaid();
    expect(
      partyFromStored(columnsOf(raid), stored({ ...oldState(raid), v: 4 }), raid.mirrorMessages),
    ).toEqual({ ok: true, party: raid });
    // Version 4 knew no trains: what such a document says of one is not read.
    const train = fullTrain();
    expect(problem(columnsOf(train), stored({ ...oldState(train), v: 4 }))).toBe(
      'a train without its train details',
    );
  });
});
