import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  CAROL,
  PARTY_NOW,
  REPORTER,
  testTrain,
  withAttendees,
} from '../../../test/support/parties.js';
import { DEFAULT_LOBBIES, lobbySize, splitLobby } from './lobby.js';
import { isTrainKind, TRAIN_KINDS, type Party, type TrainParty } from './party.js';
import { partyFromStored, partyState, type PartyColumns } from './party-state.js';
import { PartyStatus } from './status.js';
import { createTrain, setTrainKind, splitTrain } from './train.js';

/** The columns of a party's row, as the repository writes them. */
function columnsOf(party: Party): PartyColumns {
  const { anonymous: _a, attendees: _b, groups: _c, defaultGroupId: _d, ...rest } = party;
  const { prompts: _e, makerName: _f, ...kept } = rest;
  const columns = Object.fromEntries(
    Object.entries(kept).filter(
      ([key]) => !['raid', 'timed', 'meetup', 'train', 'max'].includes(key),
    ),
  ) as PartyColumns;
  return { ...columns, mirrorMessages: [] };
}

/** A train of this kind, with Alice signed up and Bob its conductor. */
function ofKind(kind: TrainParty['train']['kind']): TrainParty {
  const train = withAttendees(testTrain({ kind }), {
    [ALICE]: { status: PartyStatus.Coming },
    [BOB]: { status: PartyStatus.Coming },
  });
  return { ...train, train: { ...train.train, conductorId: BOB } };
}

describe('the kind of a train (plan 8X-4; design 6.1)', () => {
  it('is a kind of battle: raid, Dynamax or Gigantamax, a raid train unless the maker said', () => {
    expect(TRAIN_KINDS).toEqual(['raid', 'dynamax', 'gigantamax']);
    expect(isTrainKind('dynamax')).toBe(true);
    expect(isTrainKind('max')).toBe(false);
    expect(testTrain().train.kind).toBe('raid');
    const made = createTrain({
      id: '00000000-0000-4000-8000-000000000009',
      guildId: 1,
      regionId: 1,
      createdById: REPORTER,
      name: 'Wild Area',
      now: PARTY_NOW,
      kind: 'gigantamax',
    });
    expect(made.ok && made.party.train.kind).toBe('gigantamax');
  });

  it('is changed by who may move the train and by staff, and the same kind is no change', () => {
    const train = ofKind('raid');
    const changed = setTrainKind(train, BOB, false, 'dynamax');
    expect(changed.ok && changed.party.train.kind).toBe('dynamax');
    // A train with a conductor: only they and staff move it.
    expect(setTrainKind(train, ALICE, false, 'dynamax')).toEqual({
      ok: false,
      reason: 'not-conductor',
    });
    expect(setTrainKind(train, CAROL, true, 'gigantamax')).toMatchObject({ ok: true });
    // Without a conductor anybody signed up, nobody else.
    const led = { ...train, train: { ...train.train, conductorId: null } };
    expect(setTrainKind(led, ALICE, false, 'dynamax')).toMatchObject({ ok: true });
    expect(setTrainKind(led, CAROL, false, 'dynamax')).toEqual({
      ok: false,
      reason: 'not-attending',
    });
    const same = setTrainKind(train, BOB, false, 'raid');
    expect(same.ok && same.party).toBe(train);
  });

  it('goes with a group split off into a train of its own', () => {
    const train = { ...ofKind('gigantamax'), forumPostId: '300000000000000077' };
    const split = splitTrain(
      { ...train, groups: [{ id: 'A' }, { id: 'B' }], attendees: { ...train.attendees } },
      {
        id: '00000000-0000-4000-8000-0000000000bb',
        by: BOB,
        anonymous: false,
        group: 'A',
        now: PARTY_NOW,
      },
    );
    expect(split.train.kind).toBe('gigantamax');
  });

  it('sets the lobby: a Gigantamax train fills its groups, a Dynamax train forms them on the spot', () => {
    const lobbies = { raid: 12, dynamax: 4, gigantamax: 90 };
    expect(lobbySize(ofKind('gigantamax'), lobbies)).toBe(90);
    expect(lobbySize(ofKind('dynamax'), lobbies)).toBeUndefined();
    expect(lobbySize(ofKind('raid'), lobbies)).toBeUndefined();
    // Only a raid train is told to split up above a raid's lobby.
    expect(splitLobby(ofKind('raid'), lobbies)).toBe(12);
    expect(splitLobby(ofKind('dynamax'), lobbies)).toBeUndefined();
    expect(splitLobby(ofKind('gigantamax'), DEFAULT_LOBBIES)).toBeUndefined();
  });

  it('is kept in the state document (since version 14), and a train of an older one is a raid train', () => {
    const train = ofKind('dynamax');
    const columns = columnsOf(train);
    const state = partyState(train);
    expect(state.v).toBe(15);
    expect(state.train?.kind).toBe('dynamax');
    const stored = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    expect(partyFromStored(columns, stored, [])).toEqual({ ok: true, party: train });
    const { kind: _kind, ...older } = stored.train as Record<string, unknown>;
    expect(partyFromStored(columns, { ...stored, v: 13, train: older }, [])).toEqual({
      ok: true,
      party: { ...train, train: { ...train.train, kind: 'raid' } },
    });
    expect(partyFromStored(columns, { ...stored, train: { ...older, kind: 'max' } }, [])).toEqual(
      expect.objectContaining({ ok: false }),
    );
  });
});
