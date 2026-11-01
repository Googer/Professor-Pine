import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BOB,
  MINUTE,
  PARTY_NOW,
  TEST_PIN,
  TEST_SPOT,
  testMax,
  testMeetup,
  testRaid,
  testRaidRules,
  testTrain,
  withAttendees,
} from '../../../test/support/parties.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
import { loadSettings } from '../../config/settings.js';
import { finishParty } from './attendance.js';
import { DEFAULT_LOBBIES, lobbySize, splitLobby } from './lobby.js';
import {
  blocksNewMax,
  maxEnded,
  maxSpotName,
  sameSpot,
  screenshotAtBattle,
  setMaxBoss,
  setMaxEnd,
  spotKey,
  UNLISTED_SPOT,
} from './max.js';
import { partyFromStored, partyState, type PartyColumns } from './party-state.js';
import { endParty, isBattle, isTimed, screenshotIdOf, type MaxParty, type Party } from './party.js';
import { PartyStatus } from './status.js';
import { partyTick } from './tick.js';

const settings = loadSettings(TEST_SETTINGS_PATH);
const { Present, Coming, CompletePending, Complete } = PartyStatus;

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

/** The document as MySQL hands it back (parsed JSON). */
const stored = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

function tick(party: MaxParty, now: number, previous: number | null = now - MINUTE) {
  return partyTick(party, {
    now,
    previous,
    settings,
    rules: testRaidRules(),
    autoset: () => undefined,
  });
}

describe('a max battle among the kinds of party', () => {
  it('is a battle and no timed party', () => {
    expect([testRaid(), testMax(), testMeetup(), testTrain()].map(isBattle)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(isTimed(testMax())).toBe(false);
  });

  it('holds a lobby of its tier: 4 for a Dynamax battle, 100 for a Gigantamax one', () => {
    expect(lobbySize(testMax(), DEFAULT_LOBBIES)).toBe(4);
    expect(lobbySize(testMax({ tier: 'G', boss: { key: 'machamp' } }), DEFAULT_LOBBIES)).toBe(100);
    expect(lobbySize(testMax(), { raid: 20, dynamax: 5, gigantamax: 40 })).toBe(5);
    expect(splitLobby(testMax(), DEFAULT_LOBBIES)).toBeUndefined();
  });

  it('is done when Done is pressed, and asks the others of the group who are here', () => {
    const battle = withAttendees(testMax(), {
      [ALICE]: { status: Coming },
      [BOB]: { status: Present },
    });
    const done = finishParty(battle, ALICE, PARTY_NOW, 5);
    expect(done).toMatchObject({ ok: true, left: false, asked: [BOB] });
    expect(done.party?.attendees[ALICE]?.status).toBe(Complete);
    expect(done.party?.attendees[BOB]?.status).toBe(CompletePending);
  });
});

describe('its spot', () => {
  it('is locked by the Power Spot, and by one key for every pin', () => {
    expect(spotKey(TEST_SPOT)).toBe(`w${TEST_SPOT.id}`);
    expect(spotKey(TEST_PIN)).toBe('pin');
    expect(spotKey({ ...TEST_PIN, lat: 41 })).toBe('pin');
  });

  it('is the same spot as the same Power Spot, or a pin within 50 metres', () => {
    expect(sameSpot(TEST_SPOT, { ...TEST_SPOT, title: 'Renamed' })).toBe(true);
    expect(sameSpot(TEST_SPOT, { ...TEST_SPOT, id: 'other.16' })).toBe(false);
    expect(sameSpot(TEST_PIN, { ...TEST_PIN, lat: TEST_PIN.lat + 0.0004 })).toBe(true);
    expect(sameSpot(TEST_PIN, { ...TEST_PIN, lat: TEST_PIN.lat + 0.0006 })).toBe(false);
    // A pin at a power spot's very place is still no power spot.
    expect(sameSpot(TEST_PIN, { ...TEST_SPOT, lat: TEST_PIN.lat, lon: TEST_PIN.lon })).toBe(false);
  });

  it('is named by its title, or as an unlisted power spot', () => {
    expect(maxSpotName(TEST_SPOT)).toBe('Gazebo of the Park');
    expect(maxSpotName(TEST_PIN)).toBe(UNLISTED_SPOT);
  });
});

describe('its times', () => {
  const end = at('2026-10-13T21:00');

  it('ends when it was made to end, and blocks its spot until then', () => {
    const battle = testMax();
    expect(battle.endTime).toBe(end);
    expect(battle.lastPossibleTime).toBe(end);
    expect([maxEnded(battle, end - 1), maxEnded(battle, end)]).toEqual([false, true]);
    expect([blocksNewMax(battle, end - 1), blocksNewMax(battle, end)]).toEqual([true, false]);
    expect(blocksNewMax(endParty(battle), PARTY_NOW)).toBe(false);
  });

  it('takes a new end, to the minute, and drops a meeting time after it', () => {
    const battle = {
      ...testMax(),
      groups: [{ id: 'A' as const, startTime: at('2026-10-13T15:00') }],
    };
    const later = setMaxEnd(battle, at('2026-10-13T16:00') + 30_000, PARTY_NOW);
    expect(later.party.endTime).toBe(at('2026-10-13T16:00'));
    expect(later.removed).toEqual([]);
    const sooner = setMaxEnd(battle, at('2026-10-13T14:30'), PARTY_NOW);
    expect(sooner.party.groups).toEqual([{ id: 'A' }]);
    expect(sooner.removed).toEqual(['A']);
    expect(setMaxEnd(battle, battle.endTime ?? 0, PARTY_NOW).party).toBe(battle);
  });

  it('keeps the screenshot it was reported from, and takes an end as confirming its time', () => {
    expect(testMax().max.screenshot).toBeNull();
    const shot = { id: 'abcdefghijkl', timeUncertain: true };
    const battle = testMax({ screenshot: shot });
    expect(battle.max.screenshot).toEqual(shot);
    // `/end` says the time is right, also when it gives the end the battle has.
    const same = setMaxEnd(battle, battle.endTime ?? 0, PARTY_NOW);
    expect(same.party.max.screenshot).toEqual({ id: 'abcdefghijkl', timeUncertain: false });
    expect(same.party.endTime).toBe(battle.endTime);
    const later = setMaxEnd(battle, at('2026-10-13T16:00'), PARTY_NOW);
    expect(later.party.max.screenshot?.timeUncertain).toBe(false);
  });

  it('keeps its screenshot while it lasts, as a raid keeps its own', () => {
    expect(
      screenshotIdOf(testMax({ screenshot: { id: 'abcdefghijkl', timeUncertain: false } })),
    ).toBe('abcdefghijkl');
    expect(screenshotIdOf(testMax())).toBeUndefined();
    expect(screenshotIdOf(testMax({ screenshot: { id: null, timeUncertain: true } }))).toBe(
      undefined,
    );
    const raid = testRaid();
    expect(
      screenshotIdOf({
        ...raid,
        raid: { ...raid.raid, screenshot: { id: 'mnopqrstuvwx', timeUncertain: false } },
      }),
    ).toBe('mnopqrstuvwx');
    expect(screenshotIdOf(testMeetup())).toBeUndefined();
  });
});

describe('its boss', () => {
  it('follows the boss within Dynamax, the tier with it', () => {
    const changed = setMaxBoss(testMax(), { key: 'sneasel' }, 'D1', PARTY_NOW);
    expect(changed).toMatchObject({ ok: true, changed: true });
    expect(changed.party?.max).toMatchObject({ boss: { key: 'sneasel' }, tier: 'D1' });
    expect(setMaxBoss(testMax(), { key: 'machamp' }, 'D2', PARTY_NOW)).toMatchObject({
      changed: false,
    });
  });

  it('keeps since when it has its boss: from its making, or the moment a report gave', () => {
    expect(testMax().max.bossSince).toBe(PARTY_NOW);
    expect(testMax({ bossSince: PARTY_NOW - 5 * MINUTE }).max.bossSince).toBe(
      PARTY_NOW - 5 * MINUTE,
    );
    const later = PARTY_NOW + 10 * MINUTE;
    const changed = setMaxBoss(testMax(), { key: 'sneasel' }, 'D1', later);
    expect(changed.party?.max.bossSince).toBe(later);
    // The same boss again is no change: it has had it since before.
    const same = testMax();
    expect(setMaxBoss(same, { key: 'machamp' }, 'D2', later).party).toBe(same);
  });

  it('never goes between Dynamax and Gigantamax', () => {
    expect(setMaxBoss(testMax(), { key: 'machamp' }, 'G', PARTY_NOW)).toEqual({
      ok: false,
      reason: 'max-kind-change',
    });
    const giga = testMax({ tier: 'G' });
    expect(setMaxBoss(giga, { key: 'sneasel' }, 'D1', PARTY_NOW)).toMatchObject({
      reason: 'max-kind-change',
    });
  });
});

describe('its clock (maxTick)', () => {
  it('shows the post anew when its end passes, once', () => {
    const battle = testMax({ endTime: at('2026-10-13T15:00') });
    expect(tick(battle, at('2026-10-13T14:59')).render).toBe(false);
    const passed = tick(battle, at('2026-10-13T15:00'));
    expect(passed).toMatchObject({ effects: [], render: true });
    expect(tick(battle, at('2026-10-13T15:01')).render).toBe(false);
  });

  it('asks a group whose meeting time passed whether they are done, as a raid', () => {
    const battle = withAttendees(
      { ...testMax(), groups: [{ id: 'A' as const, startTime: at('2026-10-13T14:10') }] },
      { [ALICE]: { status: Present } },
    );
    // The meeting time stays shown ten minutes (startClearTime), then the group is asked.
    const result = tick(battle, at('2026-10-13T14:21'));
    expect(result.effects).toEqual([{ kind: 'ask-complete', group: 'A', members: [ALICE] }]);
    expect(result.party.attendees[ALICE]?.status).toBe(CompletePending);
  });

  it('warns of the archiving and asks for the end as a raid, after its end', () => {
    const battle = testMax({ endTime: at('2026-10-13T15:00') });
    // Grace 5 minutes, warning 10.
    const after = at('2026-10-13T15:05') + 1;
    const warned = tick(battle, after);
    expect(warned.effects).toEqual([{ kind: 'warn', deletionTime: after + 10 * MINUTE }]);
    expect(tick(warned.party, after + 10 * MINUTE).effects).toEqual([{ kind: 'end' }]);
  });
});

describe('the state of a max battle (version 13, and 15)', () => {
  const full = (): MaxParty => ({
    ...withAttendees(
      testMax({
        anonymous: true,
        bossSince: PARTY_NOW - 3 * MINUTE,
        screenshot: { id: 'abcdefghijkl', timeUncertain: true },
      }),
      {
        [ALICE]: { status: Present, number: 2, remote: true, name: 'Alice', team: 'mystic' },
      },
    ),
    groups: [
      { id: 'A' },
      { id: 'B', opened: PARTY_NOW + MINUTE, startTime: PARTY_NOW + 30 * MINUTE },
    ],
    defaultGroupId: 'B',
  });

  it('comes back from storage exactly as it went in, at a Power Spot and at a pin', () => {
    const battle = full();
    expect(partyState(battle)).toMatchObject({ v: 15, max: battle.max });
    expect(partyFromStored(columnsOf(battle), stored(partyState(battle)), [])).toEqual({
      ok: true,
      party: battle,
    });
    const pinned: MaxParty = { ...battle, max: { ...battle.max, spot: TEST_PIN } };
    expect(partyFromStored(columnsOf(pinned), stored(partyState(pinned)), [])).toEqual({
      ok: true,
      party: pinned,
    });
  });

  it('reads a document of versions 13 and 14 as having its boss since it was made, and no screenshot', () => {
    const battle = full();
    const { bossSince: _since, screenshot: _shot, ...older } = battle.max;
    for (const v of [13, 14]) {
      const state = { ...(stored(partyState(battle)) as object), v, max: stored(older) };
      expect(partyFromStored(columnsOf(battle), state, [])).toEqual({
        ok: true,
        party: { ...battle, max: { ...battle.max, bossSince: battle.createdAt, screenshot: null } },
      });
    }
    // Version 15 needs both.
    const state = stored(partyState(battle)) as Record<string, unknown>;
    const read = partyFromStored(columnsOf(battle), { ...state, max: stored(older) }, []);
    expect(read.ok ? 'read' : read.problem).toMatch(/^state: /);
  });

  it('refuses a max battle at a gym or a PokéStop, of an unknown tier, or of a document before 13', () => {
    const battle = full();
    const state = stored(partyState(battle)) as Record<string, unknown>;
    const problem = (s: unknown, c: PartyColumns = columnsOf(battle)): string => {
      const read = partyFromStored(c, s, []);
      return read.ok ? 'read' : read.problem;
    };
    const max = battle.max;
    expect(problem({ ...state, max: { ...max, spot: { ...TEST_SPOT, kind: 'stop' } } })).toMatch(
      /^state: /,
    );
    expect(problem({ ...state, max: { ...max, tier: 'D6' } })).toMatch(/^state: /);
    expect(problem({ ...state, max: undefined })).toBe(
      'a max battle without its max battle details',
    );
    // A document of version 12 knew no max battles.
    expect(problem({ ...state, v: 12 })).toBe('a max battle without its max battle details');
    expect(problem(state, { ...columnsOf(battle), gymId: 3 })).toBe('a max battle with a gym');
    // And no raid has a max battle's details.
    const raid = testRaid();
    expect(problem({ ...(stored(partyState(raid)) as object), max }, columnsOf(raid))).toBe(
      'a raid with the details of a max battle',
    );
    expect(() => partyState({ ...battle, max: { ...max, tier: 'D9' as never } })).toThrow(
      /cannot be stored/,
    );
  });
});

describe('a screenshot of the battle at its spot (screenshotAtBattle, plan 8X-S)', () => {
  const SHOT = { id: 'Ab3_-xY9zQ12', timeUncertain: false };
  /** A screenshot of the battle's own boss, taken at 14:00 surely, its countdown to 15:00. */
  const shot = (overrides: Partial<Parameters<typeof screenshotAtBattle>[1]> = {}) => ({
    boss: { key: 'machamp' },
    tier: 'D2' as const,
    end: at('2026-10-13T15:00'),
    takenAt: PARTY_NOW,
    sureMoment: true,
    rotationEnd: true,
    screenshot: SHOT,
    ...overrides,
  });
  /** Machamp (2★) until 14:30, its boss since 13:00. */
  const battle = testMax({ endTime: at('2026-10-13T14:30'), bossSince: at('2026-10-13T13:00') });

  it('joins the same boss, its end moved later by a clean read, and the screenshot the post’s', () => {
    const step = screenshotAtBattle(battle, shot(), PARTY_NOW);
    expect(step).toMatchObject({ ok: true, did: 'join', endMoved: true, removed: [] });
    if (!step.ok) return;
    expect(step.party.endTime).toBe(at('2026-10-13T15:00'));
    expect(step.party.max.screenshot).toEqual(SHOT);
    expect(step.party.max.bossSince).toBe(at('2026-10-13T13:00'));
  });

  it('keeps the end of the same boss unless the read is clean and the end later', () => {
    const kept = (overrides: Parameters<typeof shot>[0]) => {
      const step = screenshotAtBattle(battle, shot(overrides), PARTY_NOW);
      expect(step).toMatchObject({ ok: true, did: 'join', endMoved: false });
      return step.ok ? step.party : undefined;
    };
    // Never earlier.
    expect(kept({ end: at('2026-10-13T14:15') })).toBe(battle);
    // A moment not sure, an all-day countdown capped at 21:00: the end stays.
    expect(kept({ sureMoment: false })).toBe(battle);
    expect(kept({ rotationEnd: false, end: at('2026-10-13T21:00') })).toBe(battle);
  });

  it('changes another boss of the kind on a newer sure screenshot: boss, tier, end and screenshot', () => {
    const met = withAttendees(
      {
        ...battle,
        endTime: at('2026-10-13T16:00'),
        groups: [{ id: 'A', startTime: at('2026-10-13T15:30') }],
      },
      { [ALICE]: {} },
    );
    const step = screenshotAtBattle(
      met,
      shot({ boss: { key: 'machop' }, tier: 'D1', end: at('2026-10-13T15:00') }),
      PARTY_NOW,
    );
    expect(step).toMatchObject({ ok: true, did: 'change', removed: ['A'] });
    if (!step.ok) return;
    expect(step.party.max).toMatchObject({
      boss: { key: 'machop' },
      tier: 'D1',
      bossSince: PARTY_NOW,
      screenshot: SHOT,
    });
    expect(step.party.endTime).toBe(at('2026-10-13T15:00'));
    // The meeting time after the new end goes; the members stay.
    expect(step.party.groups).toEqual([{ id: 'A' }]);
    expect(Object.keys(step.party.attendees)).toContain(ALICE);
  });

  it('refuses another boss on a moment not sure, or no newer than the boss the battle has', () => {
    const other = { boss: { key: 'machop' }, tier: 'D1' as const };
    expect(screenshotAtBattle(battle, shot({ ...other, sureMoment: false }), PARTY_NOW)).toEqual({
      ok: false,
      reason: 'max-other-boss',
    });
    expect(
      screenshotAtBattle(battle, shot({ ...other, takenAt: at('2026-10-13T13:00') }), PARTY_NOW),
    ).toEqual({ ok: false, reason: 'max-other-boss' });
  });

  // Matt, 2026-10-23 (review r4 A2): the tier is left to `/boss`.
  it('joins the same boss at another tier of the kind, its tier kept', () => {
    const step = screenshotAtBattle(battle, shot({ tier: 'D3', sureMoment: false }), PARTY_NOW);
    expect(step).toMatchObject({ ok: true, did: 'join', endMoved: false });
    if (!step.ok) return;
    expect(step.party).toBe(battle);
  });

  // Review r4 A3.
  it('confirms a guessed end that a clean read of the same minute shows, the screenshot the post’s', () => {
    const guessed = {
      ...battle,
      max: { ...battle.max, screenshot: { id: 'Old_shot_123', timeUncertain: true } },
    };
    const step = screenshotAtBattle(
      guessed,
      shot({ end: at('2026-10-13T14:30') + 40_000 }),
      PARTY_NOW,
    );
    expect(step).toMatchObject({ ok: true, did: 'join', endMoved: false, confirmed: true });
    if (!step.ok) return;
    expect(step.party.endTime).toBe(at('2026-10-13T14:30'));
    expect(step.party.max.screenshot).toEqual(SHOT);
  });

  // Review r4 A4.
  it('keeps the screenshot the post has when the new one was not kept', () => {
    const kept = {
      ...battle,
      max: { ...battle.max, screenshot: { id: 'Old_shot_123', timeUncertain: true } },
    };
    const step = screenshotAtBattle(
      kept,
      shot({ screenshot: { id: null, timeUncertain: false } }),
      PARTY_NOW,
    );
    expect(step).toMatchObject({ ok: true, did: 'join', endMoved: true });
    if (!step.ok) return;
    expect(step.party.max.screenshot).toEqual({ id: 'Old_shot_123', timeUncertain: false });
  });

  // Review S-9: nothing to write, nothing to draw again.
  it('gives the very same battle for a clean read of the end it has, confirmed already', () => {
    const sure = {
      ...battle,
      max: { ...battle.max, screenshot: { id: 'Old_shot_123', timeUncertain: false } },
    };
    const end = { end: at('2026-10-13T14:30') };
    const unkept = screenshotAtBattle(
      sure,
      shot({ ...end, screenshot: { id: null, timeUncertain: false } }),
      PARTY_NOW,
    );
    expect(unkept).toMatchObject({ ok: true, did: 'join', confirmed: true });
    expect(unkept.ok && unkept.party).toBe(sure);
    // The same screenshot again.
    const again = screenshotAtBattle(
      sure,
      shot({ ...end, screenshot: { id: 'Old_shot_123', timeUncertain: false } }),
      PARTY_NOW,
    );
    expect(again.ok && again.party).toBe(sure);
  });

  it('refuses the other kind even on a newer sure screenshot', () => {
    const giga = shot({ boss: { key: 'machamp' }, tier: 'G' });
    expect(screenshotAtBattle(battle, giga, PARTY_NOW)).toEqual({
      ok: false,
      reason: 'max-kind-change',
    });
  });
});
