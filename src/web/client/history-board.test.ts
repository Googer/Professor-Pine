import { describe, expect, it } from 'vitest';
import type { RegionBoardView } from '../../domain/web/region-board-data.js';
import {
  boardAddress,
  boardFailure,
  boardLoginHref,
  boardTable,
  PERIOD_CHOICES,
  periodOfAddress,
} from './history-board.js';

const VIEW: RegionBoardView = {
  period: 'all',
  title: 'Raids and max battles by region, all time',
  rows: [
    { name: '#east', raids: 25_114, maxes: 0 },
    { name: '#west', raids: 4, maxes: 1 },
    { name: 'Region 3', raids: 0, maxes: 0 },
  ],
  gone: { raids: 2, maxes: 0 },
  total: { raids: 25_120, maxes: 1 },
};

describe('the region board on the history page', () => {
  it('offers the three periods, this month first', () => {
    expect(PERIOD_CHOICES).toEqual([
      { period: 'month', label: 'This month' },
      { period: 'year', label: 'This year' },
      { period: 'all', label: 'All time' },
    ]);
  });

  it('asks the server’s route for a period, and reads the period of the page’s address', () => {
    expect(boardAddress('412345678901234567', 'year')).toBe(
      '/s/412345678901234567/api/stats/regions?period=year',
    );
    expect(periodOfAddress('?period=all')).toBe('all');
    expect(periodOfAddress('?period=decade')).toBe('month');
    expect(periodOfAddress('')).toBe('month');
  });

  it('sends a login back to the page itself, without its query (P3)', () => {
    expect(boardLoginHref('/s/412345678901234567/history')).toBe(
      '/auth/login?next=%2Fs%2F412345678901234567%2Fhistory',
    );
  });

  it('lays the board out as rows of the table, numbered, counts with commas, then the foot', () => {
    expect(boardTable(VIEW)).toEqual({
      rows: [
        ['1', '#east', '25,114', '0'],
        ['2', '#west', '4', '1'],
        ['3', 'Region 3', '0', '0'],
      ],
      foot: [
        ['', 'No longer a region', '2', '0'],
        ['', 'Total', '25,120', '1'],
      ],
    });
    expect(boardTable({ ...VIEW, gone: null }).foot).toEqual([['', 'Total', '25,120', '1']]);
  });

  it('says what keeps the board from showing, with the login where it helps', () => {
    expect(boardFailure(401, 'discord')).toEqual({
      text: "Log in with Discord to see this server's history.",
      login: true,
    });
    expect(boardFailure(401, 'links')).toEqual({
      text: "Use /maps in Discord to log in and see this server's history.",
      login: false,
    });
    expect(boardFailure(403, 'discord')).toEqual({
      text: 'Members only: this page is for the members of this server.',
      login: false,
    });
    expect(boardFailure(503, 'discord').text).toBe(
      'Discord cannot be reached just now. Try again in a moment.',
    );
    expect(boardFailure(429, 'discord').text).toBe(
      'That was a lot of asking. Try again in a minute.',
    );
    expect(boardFailure(undefined, 'discord').text).toBe(
      'The board could not be loaded. Try again in a moment.',
    );
  });
});
