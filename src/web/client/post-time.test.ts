import { describe, expect, it } from 'vitest';
import { postTime, zoneNote } from './post-time.js';

/** Tuesday 13 October 2026, 14:30 in New York. */
const AT = Date.UTC(2026, 9, 13, 18, 30);
const MINUTE = 60_000;
const NEW_YORK = { locale: 'en-US', timeZone: 'America/New_York' };

describe('postTime: a post’s time as Discord shows it, in the reader’s zone (plan 8M-8A)', () => {
  it('writes each of Discord’s styles', () => {
    const shown = (style: Parameters<typeof postTime>[1]) => postTime(AT, style, AT, NEW_YORK);
    expect(shown('t')).toBe('2:30 PM');
    expect(shown('T')).toBe('2:30:00 PM');
    expect(shown('d')).toBe('10/13/2026');
    expect(shown('D')).toBe('October 13, 2026');
    expect(shown('f')).toBe('October 13, 2026 at 2:30 PM');
    expect(shown('F')).toBe('Tuesday, October 13, 2026 at 2:30 PM');
  });

  it('writes the time in the reader’s own zone, not the server’s', () => {
    expect(postTime(AT, 't', AT, { locale: 'en-US', timeZone: 'America/Los_Angeles' })).toBe(
      '11:30 AM',
    );
    expect(postTime(AT, 't', AT, { locale: 'en-GB', timeZone: 'Europe/London' })).toBe('19:30');
  });

  it('names the server’s zone in a form only where the reader is elsewhere (8A-11)', () => {
    expect(zoneNote('America/New_York', 'America/New_York')).toBe('');
    expect(zoneNote('America/New_York', 'America/Los_Angeles')).toBe(' (Eastern)');
    expect(zoneNote('Europe/London', 'America/New_York')).toBe(' (United Kingdom)');
  });

  it('writes how long until or since, from now', () => {
    const relative = (now: number) => postTime(AT, 'R', now, NEW_YORK);
    expect(relative(AT - 25 * MINUTE)).toBe('in 25 minutes');
    expect(relative(AT - 90 * MINUTE)).toBe('in 2 hours');
    expect(relative(AT + 3 * MINUTE)).toBe('3 minutes ago');
    expect(relative(AT - 20_000)).toBe('in a few seconds');
    expect(relative(AT - 3 * 24 * 60 * MINUTE)).toBe('in 3 days');
  });

  // Plan 8M-11A (S6): as Discord's client words its stamps, "in a day" from 22 hours.
  it('says a day where Discord says it, not "in 24 hours"', () => {
    const relative = (now: number) => postTime(AT, 'R', now, NEW_YORK);
    expect(relative(AT - 24 * 60 * MINUTE)).toBe('in a day');
    expect(relative(AT - 22 * 60 * MINUTE)).toBe('in a day');
    expect(relative(AT - 50 * MINUTE)).toBe('in 50 minutes');
  });
});
