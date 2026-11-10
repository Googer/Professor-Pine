import { describe, expect, it } from 'vitest';
import {
  ALICE,
  AS_MAKER,
  at,
  BOB,
  MINUTE,
  PARTY_NOW,
  testMeetup,
  testRaidRules,
  withAttendees,
} from '../../../test/support/parties.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
import { loadSettings } from '../../config/settings.js';
import { endParty, setSaved, type MeetupParty } from './party.js';
import { PartyStatus } from './status.js';
import { partyTick, type TickInput } from './tick.js';
import { OPEN_PARTY_HOURS, setStartTime, setTimedEnd } from './timed.js';

const rules = testRaidRules();
/** Grace 5 minutes; the warning of a raid 10, that of a train or meetup 60. */
const settings = loadSettings(TEST_SETTINGS_PATH);
const HOUR = 60 * MINUTE;
const DAY = OPEN_PARTY_HOURS * HOUR;

function tick(party: MeetupParty, now: number, extra: Partial<TickInput> = {}) {
  return partyTick(party, {
    now,
    previous: now - MINUTE,
    settings,
    rules,
    // A meetup never asks what an egg hatches as.
    autoset: () => {
      throw new Error('a meetup has no egg');
    },
    ...extra,
  });
}

function changed<T extends { ok: boolean; party?: MeetupParty }>(change: T): MeetupParty {
  if (!change.party) throw new Error('refused');
  return change.party;
}

const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
/** Made at 14:00 by the reporter; they set the start to 16:00 and the end to 18:00. */
const planned = changed(
  setTimedEnd(
    changed(setStartTime(withAttendees(testMeetup(), { [ALICE]: {} }), AS_MAKER, START, PARTY_NOW)),
    AS_MAKER,
    END,
    PARTY_NOW,
  ),
);

describe('partyTick for a meetup: nothing but its start and its end', () => {
  it('does nothing while nothing is due: not before the start, nor between start and end', () => {
    for (const now of [PARTY_NOW + MINUTE, START - 1, START + MINUTE, END - MINUTE]) {
      expect(tick(planned, now)).toEqual({ party: planned, effects: [], render: false });
      expect(tick(planned, now).party).toBe(planned);
    }
  });

  it('has the post shown anew when the start time passes, once, and says nothing', () => {
    const at16 = tick(planned, START);
    expect(at16).toEqual({ party: planned, effects: [], render: true });
    expect(at16.party).toBe(planned);
    expect(tick(planned, START + MINUTE).render).toBe(false);
    expect(tick(planned, START + 3 * MINUTE, { previous: START - 2 * MINUTE }).render).toBe(true);
  });

  it('has the post shown anew when the end time passes, once, and says nothing', () => {
    const at18 = tick(planned, END);
    expect(at18).toEqual({ party: planned, effects: [], render: true });
    expect(at18.party).toBe(planned);
    expect(tick(planned, END + MINUTE)).toEqual({ party: planned, effects: [], render: false });
    // A tick that skipped over the end sees it too.
    expect(tick(planned, END + 3 * MINUTE, { previous: END - 2 * MINUTE }).render).toBe(true);
  });

  it('never asks anybody whether they are done, and never completes anybody', () => {
    // What a raid would be asked about: present members, and a meeting time that passed.
    const here = withAttendees(planned, {
      [ALICE]: { status: PartyStatus.Present },
      [BOB]: { status: PartyStatus.Present },
    });
    for (const now of [START + 11 * MINUTE, END, END + 4 * MINUTE]) {
      const result = tick(here, now);
      expect(result.effects).toEqual([]);
      expect(result.party).toBe(here);
    }
  });

  it('keeps a start that has passed: there is no meeting time to clear', () => {
    const result = tick(planned, START + 3 * HOUR - MINUTE, { previous: START });
    expect(result.party.timed.startTime).toBe(START);
    expect(result.party.groups).toEqual([{ id: 'A' }]);
  });
});

describe('partyTick for a meetup: archiving', () => {
  it('schedules it five minutes after the end, an hour ahead, with a warning', () => {
    expect(tick(planned, END + 5 * MINUTE).effects).toEqual([]);
    const now = END + 5 * MINUTE + 1;
    const result = tick(planned, now);
    expect(settings.trainOrMeetupDeletionWarningTime).toBe(60);
    expect(result.party.deletionTime).toBe(now + 60 * MINUTE);
    expect(result).toMatchObject({
      effects: [{ kind: 'warn', deletionTime: now + 60 * MINUTE }],
      render: true,
    });
    // Once scheduled, the next tick is quiet.
    expect(tick(result.party, now + MINUTE)).toEqual({
      party: result.party,
      effects: [],
      render: false,
    });
  });

  it('asks for the end at the archiving time, every tick until the party is ended', () => {
    const warned = tick(planned, END + 6 * MINUTE).party;
    const due = (warned.deletionTime ?? 0) + 1;
    expect(tick(warned, due - 2).effects).toEqual([]);
    const result = tick(warned, due);
    expect(result).toEqual({ party: warned, effects: [{ kind: 'end' }], render: false });
    expect(tick(warned, due + MINUTE).effects).toEqual([{ kind: 'end' }]);
    expect(tick(endParty(warned), due + MINUTE)).toMatchObject({ effects: [], render: false });
  });

  it('gives a meetup without an end a day from its start, then warns the same way', () => {
    const open = changed(
      setStartTime(withAttendees(testMeetup(), { [ALICE]: {} }), AS_MAKER, START, PARTY_NOW),
    );
    expect(tick(open, START + DAY + 5 * MINUTE).effects).toEqual([]);
    const now = START + DAY + 6 * MINUTE;
    expect(tick(open, now)).toMatchObject({
      party: { deletionTime: now + 60 * MINUTE },
      effects: [{ kind: 'warn', deletionTime: now + 60 * MINUTE }],
    });
  });

  it('gives a meetup nobody gave a time a day from when it was made', () => {
    const untimed = testMeetup();
    expect(tick(untimed, PARTY_NOW + DAY + 5 * MINUTE).effects).toEqual([]);
    const now = PARTY_NOW + DAY + 6 * MINUTE;
    expect(tick(untimed, now).effects).toEqual([{ kind: 'warn', deletionTime: now + 60 * MINUTE }]);
  });

  it('starts over when a time that was set called the archiving off', () => {
    const untimed = testMeetup();
    const late = PARTY_NOW + DAY + 6 * MINUTE;
    const warned = tick(untimed, late).party;
    expect(warned.deletionTime).not.toBeNull();
    // Somebody says when it ends after all: it is going on again.
    const going = changed(setTimedEnd(warned, AS_MAKER, late + 2 * HOUR, late + MINUTE));
    expect(going.deletionTime).toBeNull();
    expect(tick(going, late + 2 * MINUTE).effects).toEqual([]);
    const again = late + 2 * HOUR + 6 * MINUTE;
    expect(tick(going, again).effects).toEqual([
      { kind: 'warn', deletionTime: again + 60 * MINUTE },
    ]);
  });

  it('never schedules or ends a meetup a moderator saved', () => {
    const saved = setSaved(planned, true);
    expect(tick(saved, END + 2 * DAY).effects).toEqual([]);
    const warned = tick(planned, END + 6 * MINUTE).party;
    const kept = setSaved(warned, true);
    expect(kept.deletionTime).toBeNull();
    expect(tick(kept, END + 3 * HOUR).effects).toEqual([]);
  });

  it('asks for the end and nothing else when both are due', () => {
    const stale = { ...planned, deletionTime: END - MINUTE };
    expect(tick(stale, END, { previous: null })).toEqual({
      party: stale,
      effects: [{ kind: 'end' }],
      render: false,
    });
  });
});

describe('partyTick for a meetup: the date', () => {
  it('shows the post anew when the day changed since the previous tick, or on the first tick', () => {
    const tomorrow = changed(
      setTimedEnd(testMeetup(), AS_MAKER, at('2026-10-15T18:00'), PARTY_NOW),
    );
    const midnight = at('2026-10-14T00:00');
    expect(tick(tomorrow, midnight, { previous: midnight - MINUTE })).toEqual({
      party: tomorrow,
      effects: [],
      render: true,
    });
    expect(tick(tomorrow, midnight + MINUTE).render).toBe(false);
    expect(tick(tomorrow, PARTY_NOW + MINUTE, { previous: null }).render).toBe(true);
  });
});
