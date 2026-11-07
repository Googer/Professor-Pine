import { describe, expect, it } from 'vitest';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
import { zonedAt } from '../../../test/support/time.js';
import { loadSettings } from '../../config/settings.js';
import { resolvePartyTime, type PartyTimeRequest } from './party-time.js';

const ZONE = 'America/New_York';
const settings = loadSettings(TEST_SETTINGS_PATH);

/** Epoch ms for a wall-clock time in the test zone. */
function at(iso: string): number {
  return zonedAt(iso, ZONE);
}

const NOW = at('2026-10-10T14:00');

function request(overrides: Partial<PartyTimeRequest>): PartyTimeRequest {
  return {
    text: '',
    now: NOW,
    zone: ZONE,
    parameter: 'hatch',
    partyType: 'raid',
    raidKind: 'standard',
    settings,
    ...overrides,
  };
}

describe('resolvePartyTime: raid hatch time', () => {
  // Standard raid: incubates 60 min, hatched 45 min. Window: now - 45 min to creation + 60 min.
  it('rounds a duration up to the whole minute, so "in 1" is at least a minute away', () => {
    const now = at('2026-10-10T14:00:28');
    expect(resolvePartyTime(request({ text: 'in 1', now }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:02'),
    });
    expect(resolvePartyTime(request({ text: '20', now }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:21'),
    });
    expect(resolvePartyTime(request({ text: 'in 59', now }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T15:00'),
    });
  });

  it('keeps a duration that cannot be rounded up to a whole millisecond', () => {
    // Rounded up to the minute it would leave the window (now + 60 minutes): the exact time,
    // 0.9999999 hours on (3,599,999.64 ms), is kept to the millisecond below it.
    const now = at('2026-10-10T14:00:28');
    expect(resolvePartyTime(request({ text: 'in 0.9999999h', now }))).toEqual({
      kind: 'time',
      at: now + 3_599_999,
    });
  });

  it('reads "in 20" and a bare "20" as minutes from now', () => {
    expect(resolvePartyTime(request({ text: 'in 20' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:20'),
    });
    expect(resolvePartyTime(request({ text: '20' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:20'),
    });
  });

  it('takes the afternoon reading of an ambiguous time when only that fits', () => {
    expect(resolvePartyTime(request({ text: '2:30' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:30'),
    });
    expect(resolvePartyTime(request({ text: 'at 230' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:30'),
    });
  });

  it('accepts a hatch time in the recent past', () => {
    expect(resolvePartyTime(request({ text: '1:30pm' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T13:30'),
    });
  });

  it('reports the valid window when the time is outside it', () => {
    expect(resolvePartyTime(request({ text: '5pm' }))).toEqual({
      kind: 'out-of-range',
      first: at('2026-10-10T13:15'),
      last: at('2026-10-10T15:00'),
    });
  });

  it('reports the window for a well-formed duration as long as the whole incubation, as the legacy limit did', () => {
    const window = { first: at('2026-10-10T13:15'), last: at('2026-10-10T15:00') };
    expect(resolvePartyTime(request({ text: 'in 59' })).kind).toBe('time');
    expect(resolvePartyTime(request({ text: 'in 60' }))).toEqual({
      kind: 'out-of-range',
      ...window,
    });
    expect(resolvePartyTime(request({ text: 'in 90' }))).toEqual({
      kind: 'out-of-range',
      ...window,
    });
  });

  it('measures the window from the raid creation time once the raid exists', () => {
    const party = { creationTime: at('2026-10-10T13:30') };
    expect(resolvePartyTime(request({ text: '2:45pm', party }))).toEqual({
      kind: 'out-of-range',
      first: at('2026-10-10T13:15'),
      last: at('2026-10-10T14:30'),
    });
  });

  it('rejects text that is neither a time nor a duration', () => {
    expect(resolvePartyTime(request({ text: 'soon' }))).toEqual({ kind: 'unparseable' });
    expect(resolvePartyTime(request({ text: '' }))).toEqual({ kind: 'unparseable' });
  });

  it('recognises the words that clear a time', () => {
    for (const text of ['unset', 'Cancel', 'none']) {
      expect(resolvePartyTime(request({ text }))).toEqual({ kind: 'unset' });
    }
  });

  it('uses the long window of elite raids', () => {
    expect(resolvePartyTime(request({ text: '10-11 11am', raidKind: 'elite' }))).toEqual({
      kind: 'time',
      at: at('2026-10-11T11:00'),
    });
    expect(resolvePartyTime(request({ text: '10-11 11am' })).kind).toBe('out-of-range');
  });

  it('resolves a time just after midnight to tomorrow', () => {
    const now = at('2026-10-10T23:50');
    expect(resolvePartyTime(request({ text: '12:10', now }))).toEqual({
      kind: 'time',
      at: at('2026-10-11T00:10'),
    });
    expect(resolvePartyTime(request({ text: '12:10am', now }))).toEqual({
      kind: 'time',
      at: at('2026-10-11T00:10'),
    });
  });
});

describe('resolvePartyTime: text that only starts like a duration', () => {
  const train = { creationTime: NOW };

  it('reads hours as hours, not as the leading digits in minutes', () => {
    expect(
      resolvePartyTime(
        request({ text: 'in 2 hours', parameter: 'meet', partyType: 'train', party: train }),
      ),
    ).toEqual({ kind: 'time', at: at('2026-10-10T16:00') });
    expect(
      resolvePartyTime(
        request({ text: 'in 1.5 hours', parameter: 'meet', partyType: 'train', party: train }),
      ),
    ).toEqual({ kind: 'time', at: at('2026-10-10T15:30') });
  });

  it('reads a date in front of a time as a date, not as ten minutes', () => {
    // Legacy tried "10-20 6" as a duration first and got 10 minutes; now the clock parser runs.
    // 6 o'clock on the 11th is the first candidate and is inside the elite raid's window.
    expect(resolvePartyTime(request({ text: '10-11 6', raidKind: 'elite' }))).toEqual({
      kind: 'time',
      at: at('2026-10-11T06:00'),
    });
  });

  it('does not read exponent notation as a duration or a time', () => {
    expect(resolvePartyTime(request({ text: '1e3' }))).toEqual({ kind: 'unparseable' });
  });

  it('does not read a bare "m" as a meridiem', () => {
    expect(
      resolvePartyTime(
        request({ text: '5m', parameter: 'meet', partyType: 'train', party: train }),
      ),
    ).toEqual({ kind: 'unparseable' });
  });
});

describe('resolvePartyTime: parties with empty columns', () => {
  const creationTime = at('2026-10-10T13:45');

  it('gives a raid the default hatched window when hatchedDuration is 0 or null', () => {
    // Window: now to creation + 60 + 45 minutes = 15:30. With a zero hatched window it would end at 14:45.
    for (const hatchedDuration of [0, null]) {
      const party = { creationTime, hatchedDuration };
      expect(resolvePartyTime(request({ text: '3:25pm', parameter: 'end', party }))).toEqual({
        kind: 'time',
        at: at('2026-10-10T15:25'),
      });
    }
  });

  it('still honours a hatched duration that was set', () => {
    const party = { creationTime, hatchedDuration: 20 };
    expect(resolvePartyTime(request({ text: '3:25pm', parameter: 'end', party })).kind).toBe(
      'out-of-range',
    );
  });

  it('treats a null hatch time and end time as omitted', () => {
    const party = { creationTime, hatchTime: null, endTime: null };
    expect(resolvePartyTime(request({ text: '3:25pm', parameter: 'meet', party }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T15:25'),
    });
    expect(resolvePartyTime(request({ text: 'hatch', parameter: 'meet', party }))).toEqual({
      kind: 'unparseable',
    });
  });

  it('treats a null start time as omitted', () => {
    const party = { creationTime: NOW, startTime: null };
    expect(
      resolvePartyTime(request({ text: '8pm', parameter: 'end', partyType: 'meetup', party })),
    ).toEqual({ kind: 'time', at: at('2026-10-10T20:00') });
  });
});

describe('resolvePartyTime: raid end time', () => {
  // Window: now to creation + 105 min.
  it('accepts a time up to incubation plus hatched duration after creation', () => {
    expect(resolvePartyTime(request({ text: '3:15pm', parameter: 'end' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T15:15'),
    });
    expect(resolvePartyTime(request({ text: '4pm', parameter: 'end' })).kind).toBe('out-of-range');
  });

  it('does not accept an end time in the past', () => {
    expect(resolvePartyTime(request({ text: '1:30pm', parameter: 'end' }))).toEqual({
      kind: 'out-of-range',
      first: NOW,
      last: at('2026-10-10T15:45'),
    });
  });
});

describe('resolvePartyTime: raid meeting time', () => {
  const party = {
    creationTime: at('2026-10-10T13:45'),
    hatchTime: at('2026-10-10T14:30'),
    endTime: at('2026-10-10T15:15'),
  };

  it('accepts a time between hatch and end', () => {
    expect(resolvePartyTime(request({ text: '2:45', parameter: 'meet', party }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:45'),
    });
  });

  it('reads "hatch" and "start" as the hatch time', () => {
    for (const text of ['hatch', 'Start']) {
      expect(resolvePartyTime(request({ text, parameter: 'meet', party }))).toEqual({
        kind: 'time',
        at: at('2026-10-10T14:30'),
      });
    }
  });

  it('refuses a meeting time before the egg hatches or after the raid ends', () => {
    expect(resolvePartyTime(request({ text: '2:15pm', parameter: 'meet', party }))).toEqual({
      kind: 'out-of-range',
      first: at('2026-10-10T14:30'),
      last: at('2026-10-10T15:15'),
    });
    expect(resolvePartyTime(request({ text: '3:30pm', parameter: 'meet', party })).kind).toBe(
      'out-of-range',
    );
  });

  it('starts the window now once the raid has hatched', () => {
    const now = at('2026-10-10T14:40');
    expect(resolvePartyTime(request({ text: 'in 5', parameter: 'meet', party, now }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:45'),
    });
    expect(resolvePartyTime(request({ text: '2:35pm', parameter: 'meet', party, now }))).toEqual({
      kind: 'out-of-range',
      first: now,
      last: at('2026-10-10T15:15'),
    });
  });

  it('falls back to creation plus both durations when the raid has no end time', () => {
    const open = { creationTime: at('2026-10-10T13:45') };
    expect(resolvePartyTime(request({ text: '3:25pm', parameter: 'meet', party: open }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T15:25'),
    });
  });
});

describe('resolvePartyTime: trains and meetups', () => {
  const party = { creationTime: NOW };

  it('reads a meetup meeting time with a date, days ahead', () => {
    expect(
      resolvePartyTime(
        request({ text: '10-12 6pm', parameter: 'meet', partyType: 'meetup', party }),
      ),
    ).toEqual({ kind: 'time', at: at('2026-10-12T18:00') });
  });

  it('treats a bare number as a clock time, not minutes', () => {
    expect(
      resolvePartyTime(request({ text: '6', parameter: 'meet', partyType: 'train', party })),
    ).toEqual({ kind: 'time', at: at('2026-10-10T18:00') });
  });

  it('still accepts an explicit "in"', () => {
    expect(
      resolvePartyTime(request({ text: 'in 30', parameter: 'meet', partyType: 'train', party })),
    ).toEqual({ kind: 'time', at: at('2026-10-10T14:30') });
  });

  it('puts a date-less end time on the day the party starts', () => {
    const started = { creationTime: NOW, startTime: at('2026-10-12T18:00') };
    expect(
      resolvePartyTime(
        request({ text: '8pm', parameter: 'end', partyType: 'meetup', party: started }),
      ),
    ).toEqual({ kind: 'time', at: at('2026-10-12T20:00') });
  });

  it('accepts a relative end time longer than the legacy unit bug allowed', () => {
    expect(
      resolvePartyTime(request({ text: 'in 120', parameter: 'end', partyType: 'train', party })),
    ).toEqual({ kind: 'time', at: at('2026-10-10T16:00') });
  });

  it('wraps a date into next year', () => {
    const now = at('2026-12-30T12:00');
    expect(
      resolvePartyTime(
        request({
          text: '1-2 6pm',
          now,
          parameter: 'meet',
          partyType: 'meetup',
          party: { creationTime: now },
        }),
      ),
    ).toEqual({ kind: 'time', at: at('2027-01-02T18:00') });
  });

  it('refuses a meeting time beyond the lead-up limit', () => {
    // maxMeetupLeadupDuration is 133920 minutes (93 days).
    expect(
      resolvePartyTime(request({ text: '3-1 6pm', parameter: 'meet', partyType: 'meetup', party }))
        .kind,
    ).toBe('out-of-range');
  });

  it('ignores a date that does not exist', () => {
    expect(
      resolvePartyTime(
        request({ text: '2-30 6pm', parameter: 'meet', partyType: 'meetup', party }),
      ),
    ).toEqual({ kind: 'unparseable' });
  });
});

describe('resolvePartyTime: noon, midnight, tomorrow and a dot (the audit of 2026-11-07)', () => {
  const time = (iso: string) => ({ kind: 'time', at: at(iso) });
  const meetup = (text: string, now = NOW) =>
    resolvePartyTime(
      request({ text, now, parameter: 'meet', partyType: 'meetup', party: { creationTime: now } }),
    );
  /** A raid's meeting time, the raid hatched at `hatch` and ending at `end`. */
  const raid = (text: string, now: number, hatch: string, end: string) =>
    resolvePartyTime(
      request({
        text,
        now,
        parameter: 'meet',
        party: { creationTime: at(hatch) - 30 * 60_000, hatchTime: at(hatch), endTime: at(end) },
      }),
    );

  it('reads 10.17 as it reads 10:17, in the morning or the evening alike', () => {
    for (const now of [at('2026-10-10T09:30'), NOW, at('2026-10-10T21:30')]) {
      expect(meetup('10.17', now)).toEqual(meetup('10:17', now));
    }
    expect(meetup('10.17', at('2026-10-10T09:30'))).toEqual(time('2026-10-10T10:17'));
    expect(meetup('10.17')).toEqual(time('2026-10-10T22:17'));
    const morning = at('2026-10-10T09:50');
    expect(raid('10.17', morning, '2026-10-10T09:45', '2026-10-10T10:30')).toEqual(
      time('2026-10-10T10:17'),
    );
    expect(raid('10.17', morning, '2026-10-10T09:45', '2026-10-10T10:30')).toEqual(
      raid('10:17', morning, '2026-10-10T09:45', '2026-10-10T10:30'),
    );
  });

  it('reads noon and midnight', () => {
    // At two in the afternoon today's noon has passed: a meetup's start is tomorrow's.
    expect(meetup('noon')).toEqual(time('2026-10-11T12:00'));
    expect(meetup('Noon', at('2026-10-10T09:00'))).toEqual(time('2026-10-10T12:00'));
    expect(meetup('at noon', at('2026-10-10T09:00'))).toEqual(time('2026-10-10T12:00'));
    // Midnight is the one at the end of today.
    expect(meetup('midnight')).toEqual(time('2026-10-11T00:00'));
    // A raid's meeting at noon, and at midnight for a raid that ends after it.
    const late = at('2026-10-10T23:40');
    expect(raid('midnight', late, '2026-10-10T23:30', '2026-10-11T00:15')).toEqual(
      time('2026-10-11T00:00'),
    );
    const morning = at('2026-10-10T11:40');
    expect(raid('noon', morning, '2026-10-10T11:30', '2026-10-10T12:15')).toEqual(
      time('2026-10-10T12:00'),
    );
  });

  it('reads tomorrow and a time where the party may meet tomorrow', () => {
    expect(meetup('tomorrow 6pm')).toEqual(time('2026-10-11T18:00'));
    expect(meetup('Tomorrow at 9am')).toEqual(time('2026-10-11T09:00'));
    expect(meetup('tomorrow, 9:30am')).toEqual(time('2026-10-11T09:30'));
    expect(meetup('tomorrow noon')).toEqual(time('2026-10-11T12:00'));
    // A start of 1 to 6 without "am" or "pm" is the afternoon, as on any day.
    expect(meetup('tomorrow 6')).toEqual(time('2026-10-11T18:00'));
    // Tomorrow is the day after today, also for a meetup whose start is days away.
    const tuesday = at('2026-10-06T15:00');
    const saturday = { creationTime: tuesday, startTime: at('2026-10-10T18:00') };
    expect(
      resolvePartyTime(
        request({
          text: 'tomorrow 7pm',
          now: tuesday,
          parameter: 'meet',
          partyType: 'train',
          party: saturday,
        }),
      ),
    ).toEqual(time('2026-10-07T19:00'));
    // A train's end tomorrow.
    expect(
      resolvePartyTime(
        request({
          text: 'tomorrow 1am',
          parameter: 'end',
          partyType: 'train',
          party: { creationTime: NOW, startTime: at('2026-10-10T22:00') },
        }),
      ),
    ).toEqual(time('2026-10-11T01:00'));
  });

  it('reads tomorrow for a raid only where the raid lasts into it', () => {
    // A raid ends today: its group cannot meet tomorrow.
    const refused = raid('tomorrow 6pm', NOW, '2026-10-10T13:50', '2026-10-10T14:35');
    expect(refused.kind).toBe('out-of-range');
    // A raid that lasts past midnight can meet just after it.
    const late = at('2026-10-10T23:40');
    expect(raid('tomorrow 12:10am', late, '2026-10-10T23:30', '2026-10-11T00:15')).toEqual(
      time('2026-10-11T00:10'),
    );
  });

  it('reads no tomorrow without a time, nor with a date, and names no day it was read on', () => {
    expect(meetup('tomorrow')).toEqual({ kind: 'unparseable' });
    expect(meetup('tomorrow 10-12 6pm')).toEqual({ kind: 'unparseable' });
    expect(meetup('tomorrowish 6pm')).toEqual({ kind: 'unparseable' });
    // Out of range, a time typed with "tomorrow" says when it may be, not which day it was
    // read on: the refusal's "give the date first" would not fit it.
    const refused = resolvePartyTime(
      request({
        text: 'tomorrow 1pm',
        parameter: 'end',
        partyType: 'meetup',
        party: { creationTime: NOW, startTime: at('2026-10-11T15:00') },
      }),
    );
    expect(refused).toMatchObject({ kind: 'out-of-range' });
    expect(refused).not.toHaveProperty('read');
  });
});

describe('resolvePartyTime: "at" before a clock time for trains and meetups', () => {
  const party = { creationTime: NOW };

  it('ignores a leading "at", as the legacy bot did', () => {
    expect(
      resolvePartyTime(request({ text: 'at 6pm', parameter: 'meet', partyType: 'train', party })),
    ).toEqual({ kind: 'time', at: at('2026-10-10T18:00') });
    expect(
      resolvePartyTime(request({ text: 'at 8', parameter: 'end', partyType: 'meetup', party })),
    ).toEqual({ kind: 'time', at: at('2026-10-10T20:00') });
    expect(
      resolvePartyTime(
        request({ text: 'AT3:15pm', parameter: 'meet', partyType: 'meetup', party }),
      ),
    ).toEqual({ kind: 'time', at: at('2026-10-10T15:15') });
  });

  it('does not accept a bare "at"', () => {
    expect(resolvePartyTime(request({ text: 'at' }))).toEqual({ kind: 'unparseable' });
    expect(
      resolvePartyTime(request({ text: 'at', parameter: 'meet', partyType: 'train', party })),
    ).toEqual({ kind: 'unparseable' });
  });
});

describe('resolvePartyTime: a train or meetup is planned ahead', () => {
  const timed = (
    text: string,
    parameter: 'meet' | 'end',
    party: PartyTimeRequest['party'],
    now = NOW,
  ) => resolvePartyTime(request({ text, now, parameter, partyType: 'meetup', party }));
  const time = (iso: string) => ({ kind: 'time', at: at(iso) });
  // Saturday 10 October 2026, 14:00 is NOW; the party was made the day before.
  const yesterday = at('2026-10-09T10:00');

  it('reads a start that has passed today as tomorrow', () => {
    // The legacy bot refused these; nobody plans a meetup for the past.
    const evening = at('2026-10-10T19:00');
    expect(timed('6', 'meet', { creationTime: evening }, evening)).toEqual(
      time('2026-10-11T18:00'),
    );
    expect(timed('1pm', 'meet', { creationTime: NOW })).toEqual(time('2026-10-11T13:00'));
    expect(timed('1', 'meet', { creationTime: NOW })).toEqual(time('2026-10-11T13:00'));
    expect(
      resolvePartyTime(
        request({
          text: '120',
          parameter: 'meet',
          partyType: 'train',
          party: { creationTime: NOW },
        }),
      ),
    ).toEqual(time('2026-10-11T13:20'));
  });

  it('reads a start of 1 to 6 without "am" or "pm" as the afternoon before the night', () => {
    const early = at('2026-10-10T00:30');
    const fresh = { creationTime: early };
    for (const hour of [1, 2, 3, 4, 5, 6]) {
      expect(timed(String(hour), 'meet', fresh, early)).toEqual(
        time(`2026-10-10T${String(hour + 12)}:00`),
      );
    }
    // Said with "am" it is the night; from 7 on the morning comes first, as it did.
    expect(timed('1am', 'meet', fresh, early)).toEqual(time('2026-10-10T01:00'));
    expect(timed('7', 'meet', fresh, early)).toEqual(time('2026-10-10T07:00'));
    expect(timed('11', 'meet', fresh, early)).toEqual(time('2026-10-10T11:00'));
    // With a date too.
    expect(timed('10-14 6', 'meet', fresh, early)).toEqual(time('2026-10-14T18:00'));
    expect(timed('10-14 6am', 'meet', fresh, early)).toEqual(time('2026-10-14T06:00'));
    expect(timed('10-14 9', 'meet', fresh, early)).toEqual(time('2026-10-14T09:00'));
  });

  it('reads a new start on the day of a start that is still to come, afternoon first', () => {
    // Typed on a Tuesday for a meetup that starts on Saturday at 18:00.
    const tuesday = at('2026-10-06T15:00');
    const party = { creationTime: at('2026-10-05T10:00'), startTime: at('2026-10-10T18:00') };
    expect(timed('6:15', 'meet', party, tuesday)).toEqual(time('2026-10-10T18:15'));
    expect(timed('5', 'meet', party, tuesday)).toEqual(time('2026-10-10T17:00'));
  });

  it('never reads a start into the past, also for a party made days ago', () => {
    // 06:15 today lies after the party was made, and before now: the afternoon is meant.
    expect(timed('6:15', 'meet', { creationTime: yesterday })).toEqual(time('2026-10-10T18:15'));
    expect(timed('9am', 'meet', { creationTime: yesterday })).toEqual(time('2026-10-11T09:00'));
  });

  it('reads a new start today when the old start was on a day that has passed', () => {
    const party = { creationTime: at('2026-10-08T10:00'), startTime: at('2026-10-09T18:00') };
    expect(timed('7pm', 'meet', party)).toEqual(time('2026-10-10T19:00'));
    expect(timed('6pm', 'end', party)).toEqual(time('2026-10-10T18:00'));
  });

  describe('typed on a Tuesday at 14:00 for a meetup that ends on Saturday', () => {
    const tuesday = at('2026-10-13T14:00');
    const made = at('2026-10-12T10:00');
    const saturdayEnd = at('2026-10-17T21:00');

    it('reads a time on the day of the end when there is no start', () => {
      const party = { creationTime: made, endTime: saturdayEnd };
      expect(timed('10pm', 'end', party, tuesday)).toEqual(time('2026-10-17T22:00'));
      expect(timed('6pm', 'meet', party, tuesday)).toEqual(time('2026-10-17T18:00'));
      // Afternoon first for a start, as on any day.
      expect(timed('6', 'meet', party, tuesday)).toEqual(time('2026-10-17T18:00'));
    });

    it('reads a time on the day of the end when the day of the start has passed', () => {
      const party = {
        creationTime: made,
        startTime: at('2026-10-12T18:00'),
        endTime: saturdayEnd,
      };
      expect(timed('10pm', 'end', party, tuesday)).toEqual(time('2026-10-17T22:00'));
      expect(timed('6pm', 'meet', party, tuesday)).toEqual(time('2026-10-17T18:00'));
      // The day after the end is not guessed: it is not within half a day of now. An hour of
      // the night is that of Saturday itself.
      expect(timed('1am', 'end', party, tuesday)).toEqual(time('2026-10-17T01:00'));
    });

    it('goes by the start before the end while the day of the start is still to come', () => {
      const party = {
        creationTime: made,
        startTime: at('2026-10-17T18:00'),
        endTime: at('2026-10-18T02:00'),
      };
      expect(timed('11pm', 'end', party, tuesday)).toEqual(time('2026-10-17T23:00'));
      expect(timed('7pm', 'meet', party, tuesday)).toEqual(time('2026-10-17T19:00'));
      const startOnly = { creationTime: made, startTime: at('2026-10-17T18:00') };
      expect(timed('11pm', 'end', startOnly, tuesday)).toEqual(time('2026-10-17T23:00'));
      expect(timed('7pm', 'meet', startOnly, tuesday)).toEqual(time('2026-10-17T19:00'));
    });

    it('reads a time today when no time is set, or the days of both have passed', () => {
      expect(timed('10pm', 'end', { creationTime: made }, tuesday)).toEqual(
        time('2026-10-13T22:00'),
      );
      expect(timed('6pm', 'meet', { creationTime: made }, tuesday)).toEqual(
        time('2026-10-13T18:00'),
      );
      const over = {
        creationTime: at('2026-10-10T10:00'),
        startTime: at('2026-10-11T18:00'),
        endTime: at('2026-10-12T21:00'),
      };
      expect(timed('10pm', 'end', over, tuesday)).toEqual(time('2026-10-13T22:00'));
      expect(timed('6pm', 'meet', over, tuesday)).toEqual(time('2026-10-13T18:00'));
    });
  });

  it('reads a new start on the day of the old one while that day is still to come', () => {
    const party = { creationTime: yesterday, startTime: at('2026-10-12T18:00') };
    expect(timed('7pm', 'meet', party)).toEqual(time('2026-10-12T19:00'));
    expect(timed('10', 'meet', party)).toEqual(time('2026-10-12T10:00'));
  });

  it('reads an end after the start: the afternoon, or the day after', () => {
    const afternoon = { creationTime: yesterday, startTime: at('2026-10-17T14:00') };
    expect(timed('5', 'end', afternoon)).toEqual(time('2026-10-17T17:00'));
    const night = { creationTime: yesterday, startTime: at('2026-10-17T22:00') };
    expect(timed('1am', 'end', night)).toEqual(time('2026-10-18T01:00'));
    // An end stays in the order of the clock: one in the night, not one in the afternoon.
    expect(timed('1', 'end', night)).toEqual(time('2026-10-18T01:00'));
  });

  it('puts an end on the day after only within half a day of the start, or of now', () => {
    const refused = (text: string, party: PartyTimeRequest['party'], read: string) => {
      const result = timed(text, 'end', party);
      expect(result).toMatchObject({ kind: 'out-of-range', read: at(read) });
    };
    // Starts today at 15:00: an end at 13:00 is a mistake, not tomorrow.
    const today = { creationTime: NOW, startTime: at('2026-10-10T15:00') };
    refused('1pm', today, '2026-10-10T13:00');
    // Starts at 18:00: noon and 13:00 of the next day are too far.
    const evening = { creationTime: NOW, startTime: at('2026-10-10T18:00') };
    refused('12', evening, '2026-10-10T12:00');
    refused('1pm', evening, '2026-10-10T13:00');
    expect(timed('5', 'end', evening)).toEqual(time('2026-10-11T05:00'));
    expect(timed('6am', 'end', evening)).toEqual(time('2026-10-11T06:00'));
    refused('7am', evening, '2026-10-10T07:00');
    // Without a start it is half a day from now (14:00).
    refused('9am', { creationTime: NOW }, '2026-10-10T09:00');
    expect(timed('1am', 'end', { creationTime: NOW })).toEqual(time('2026-10-11T01:00'));
    expect(timed('2am', 'end', { creationTime: NOW })).toEqual(time('2026-10-11T02:00'));
    refused('2:01am', { creationTime: NOW }, '2026-10-10T02:01');
  });

  it('refuses an end at or before the start that is given with its date', () => {
    const party = { creationTime: yesterday, startTime: at('2026-10-17T14:00') };
    expect(timed('10-17 1pm', 'end', party)).toEqual({
      kind: 'out-of-range',
      first: at('2026-10-17T14:00'),
      last: at('2027-01-11T10:00'),
    });
    expect(timed('10-17 3pm', 'end', party)).toEqual(time('2026-10-17T15:00'));
  });

  it('says on which day a time without a date was read when no reading fits', () => {
    // Made 93 days ago: the latest start is today 14:00, and 15:00 is past it on any day.
    const old = { creationTime: NOW - 133_920 * 60_000 };
    expect(timed('3pm', 'meet', old)).toEqual({
      kind: 'out-of-range',
      first: NOW,
      last: NOW,
      read: at('2026-10-10T15:00'),
    });
    // A text with a date says its own day.
    expect(timed('10-11 3pm', 'meet', old)).toEqual({
      kind: 'out-of-range',
      first: NOW,
      last: NOW,
    });
  });
});

describe('resolvePartyTime: tomorrow is only guessed for standard raids and timed parties', () => {
  it('refuses a train end time that already passed today', () => {
    const party = { creationTime: NOW, startTime: at('2026-10-10T15:00') };
    expect(
      resolvePartyTime(request({ text: '1pm', parameter: 'end', partyType: 'train', party })).kind,
    ).toBe('out-of-range');
  });

  it('refuses an elite raid hatch time that already passed today', () => {
    const now = at('2026-10-10T19:00');
    // "6am", not "6": a bare 6 is also six minutes from now, which legacy accepted too.
    expect(resolvePartyTime(request({ text: '6am', now, raidKind: 'elite' })).kind).toBe(
      'out-of-range',
    );
  });
});

describe('resolvePartyTime: yesterday is guessed just after midnight for standard raids', () => {
  const now = at('2026-10-11T00:10');

  it('reads a time shortly before midnight as the evening before', () => {
    expect(resolvePartyTime(request({ text: '11:50pm', now }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T23:50'),
    });
  });

  it('does not guess yesterday for an elite raid', () => {
    // An elite egg created at 23:55 yesterday is valid until 23:55 yesterday plus a day. Today's
    // 11:50pm is past that, and only a yesterday guess would land inside the window.
    const party = { creationTime: at('2026-10-09T23:55') };
    expect(resolvePartyTime(request({ text: '11:50pm', now, raidKind: 'elite', party })).kind).toBe(
      'out-of-range',
    );
  });

  it('does not guess yesterday when a date was typed', () => {
    expect(resolvePartyTime(request({ text: '10-11 11:50pm', now })).kind).toBe('out-of-range');
  });
});

describe('resolvePartyTime: daylight saving time', () => {
  it('moves a time inside the spring-forward gap forward', () => {
    const now = at('2026-03-08T01:40');
    expect(resolvePartyTime(request({ text: '2:30am', now }))).toEqual({
      kind: 'time',
      at: Date.UTC(2026, 2, 8, 7, 30),
    });
  });

  it('takes the first of the two repeated hours when falling back', () => {
    const now = at('2026-11-01T00:50');
    expect(resolvePartyTime(request({ text: '1:30am', now }))).toEqual({
      kind: 'time',
      at: Date.UTC(2026, 10, 1, 5, 30),
    });
  });

  it('takes the second of the repeated hours once the clocks have fallen back', () => {
    // 01:10 EST, the second 01:10: "1:30am" is twenty minutes ahead (01:30 EST), not the 01:30
    // EDT of forty minutes ago, which is no hatch time.
    const now = Date.UTC(2026, 10, 1, 6, 10);
    expect(resolvePartyTime(request({ text: '1:30am', now }))).toEqual({
      kind: 'time',
      at: Date.UTC(2026, 10, 1, 6, 30),
    });
  });
});

describe('resolvePartyTime: duration is read before clock time', () => {
  it('reads 0:10 as ten minutes, not ten past midnight', () => {
    // Faithful to types/time.js and intentional: a relative duration is tried first.
    const now = at('2026-10-10T23:50');
    expect(resolvePartyTime(request({ text: '0:10', now }))).toEqual({
      kind: 'time',
      at: at('2026-10-11T00:00'),
    });
  });
});

describe('resolvePartyTime: time zone', () => {
  it('reads wall-clock times in the configured zone, not UTC', () => {
    const result = resolvePartyTime(request({ text: '2:30pm' }));
    expect(result).toEqual({ kind: 'time', at: Date.UTC(2026, 9, 10, 18, 30) });
  });
});
