import { describe, expect, it } from 'vitest';
import type { RegionTallyView } from '../../domain/web/region-tally-data.js';
import {
  tallyAddress,
  tallyFailure,
  tallyLoginHref,
  tallyTable,
  PERIOD_CHOICES,
  periodOfAddress,
  quietLine,
} from './history-tally.js';

const VIEW: RegionTallyView = {
  period: 'all',
  title: 'Raids and max battles by region, all time',
  rows: [
    { name: '#east', raids: 25_114, maxes: 0 },
    { name: '#west', raids: 4, maxes: 1 },
  ],
  quiet: ['#north', 'Region 3'],
  gone: { raids: 2, maxes: 0 },
  total: { raids: 25_120, maxes: 1 },
};

describe('the region tally on the history page', () => {
  it('offers the three periods, this month first', () => {
    expect(PERIOD_CHOICES).toEqual([
      { period: 'month', label: 'This month' },
      { period: 'year', label: 'This year' },
      { period: 'all', label: 'All time' },
    ]);
  });

  it('asks the server’s route for a period, and reads the period of the page’s address', () => {
    expect(tallyAddress('412345678901234567', 'year')).toBe(
      '/s/412345678901234567/api/stats/regions?period=year',
    );
    expect(periodOfAddress('?period=all')).toBe('all');
    expect(periodOfAddress('?period=decade')).toBe('month');
    expect(periodOfAddress('')).toBe('month');
  });

  it('sends a login back to the page itself, without its query (P3)', () => {
    expect(tallyLoginHref('/s/412345678901234567/history')).toBe(
      '/auth/login?next=%2Fs%2F412345678901234567%2Fhistory',
    );
  });

  it('lays the tally out as rows of the table, numbered, counts with commas, then the foot', () => {
    expect(tallyTable(VIEW)).toEqual({
      rows: [
        ['1', '#east', '25,114', '0'],
        ['2', '#west', '4', '1'],
      ],
      foot: [
        ['', 'No longer a region', '2', '0'],
        ['', 'Total', '25,120', '1'],
      ],
    });
    expect(tallyTable({ ...VIEW, gone: null }).foot).toEqual([['', 'Total', '25,120', '1']]);
  });

  it('names the quiet regions on one line under the table, or says that every region was quiet', () => {
    expect(quietLine(VIEW)).toBe('No raids or max battles: #north, Region 3');
    expect(quietLine({ ...VIEW, quiet: [] })).toBeNull();
    const none = { ...VIEW, rows: [], gone: null, total: { raids: 0, maxes: 0 } };
    expect(quietLine({ ...none, period: 'month' })).toBe(
      'No raids or max battles this month in any region.',
    );
    expect(quietLine({ ...none, period: 'all' })).toBe(
      'No raids or max battles in any region yet.',
    );
    // A server the member sees no region of says nothing of quiet ones.
    expect(quietLine({ ...none, quiet: [] })).toBeNull();
  });

  it('says what keeps the tally from showing, with the login where it helps', () => {
    expect(tallyFailure(401, 'discord')).toEqual({
      text: "Log in with Discord to see this server's history.",
      login: true,
    });
    expect(tallyFailure(401, 'links')).toEqual({
      text: "Use /maps in Discord to log in and see this server's history.",
      login: false,
    });
    expect(tallyFailure(403, 'discord')).toEqual({
      text: 'Members only: this page is for the members of this server.',
      login: false,
    });
    expect(tallyFailure(503, 'discord').text).toBe(
      'Discord cannot be reached just now. Try again in a moment.',
    );
    expect(tallyFailure(429, 'discord').text).toBe(
      'That was a lot of asking. Try again in a minute.',
    );
    expect(tallyFailure(undefined, 'discord').text).toBe(
      'The board could not be loaded. Try again in a moment.',
    );
  });
});
