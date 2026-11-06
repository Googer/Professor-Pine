import { describe, expect, it } from 'vitest';
import type { BoardView, MemberCardView } from '../../domain/web/board-data.js';
import {
  boardLines,
  boardsAddress,
  meAddress,
  meHref,
  meLines,
  barCaption,
  monthBars,
  monthTable,
  yearOfAddress,
} from './history-boards.js';

const GUILD = '412345678901234567';

const board = (overrides: Partial<BoardView> = {}): BoardView => ({
  board: 'raids',
  title: 'Raids reported that others completed, this month',
  rows: [
    { rank: 1, name: 'Bob', count: '2 raids' },
    { rank: 2, name: 'Alice', count: '1 raid' },
  ],
  empty: null,
  note: null,
  viewer: null,
  ...overrides,
});

type Shown = MemberCardView;
const stats = (overrides: Partial<Shown> = {}): Shown => ({
  optedIn: true,
  year: null,
  years: [2026, 2025],
  title: 'Your history, all time',
  raids: { count: 12, anonymous: 3 },
  trains: { count: 2, anonymous: 0 },
  meetups: { count: 0, anonymous: 0 },
  reports: { count: 20, confirmations: 14 },
  completed: 40,
  trainsCame: 3,
  meetupsCame: 1,
  busiestRegion: '#west',
  bosses: [
    { name: 'Mewtwo', count: 5 },
    { name: 'Dialga', count: 3 },
  ],
  sent: 1234,
  months: [],
  ...overrides,
});

describe('the boards on the history page', () => {
  it('asks for a period’s boards, and a member’s own numbers of a year or all time', () => {
    expect(boardsAddress(GUILD, 'year')).toBe(`/s/${GUILD}/api/stats/boards?period=year`);
    expect(meAddress(GUILD, null)).toBe(`/s/${GUILD}/api/stats/me`);
    expect(meAddress(GUILD, 2025)).toBe(`/s/${GUILD}/api/stats/me?year=2025`);
    expect(meHref(GUILD)).toBe(`/s/${GUILD}/me`);
  });

  it('lays a board out as its lines, or what it says where it has none', () => {
    expect(boardLines(board())).toEqual(['1. Bob: 2 raids', '2. Alice: 1 raid']);
    expect(boardLines(board({ rows: [], empty: 'Nobody is ranked here this month.' }))).toEqual([
      'Nobody is ranked here this month.',
    ]);
  });

  it('reads the year of the page’s address, else all time', () => {
    expect(yearOfAddress('?year=2025')).toBe(2025);
    expect(yearOfAddress('?year=25')).toBeNull();
    expect(yearOfAddress('')).toBeNull();
  });
});

describe('"Your history"', () => {
  it('words the member’s numbers as /stats me does', () => {
    expect(meLines(stats())).toEqual([
      {
        label: 'Raids and max battles reported that others completed',
        value: '12 (3 anonymous, on no board)',
      },
      { label: 'Trains conducted that others came to', value: '2' },
      { label: 'Meetups hosted that others came to', value: '0' },
      { label: 'Reports at stops that counted', value: '20 (14 confirmations)' },
      { label: 'Raids and max battles completed', value: '40' },
      { label: 'Trains ridden', value: '3' },
      { label: 'Meetups attended', value: '1' },
      { label: 'Busiest region', value: '#west' },
      { label: 'Bosses beaten most', value: 'Mewtwo (5), Dialga (3)' },
      { label: 'Raids, max battles, trains and reports sent to', value: '1,234 members' },
    ]);
    const quiet = meLines(stats({ busiestRegion: null, bosses: [] })).map((line) => line.label);
    expect(quiet).not.toContain('Busiest region');
    expect(quiet).not.toContain('Bosses beaten most');
  });

  it('scales the bars of the months to the busiest, with every month between', () => {
    const bars = monthBars(
      [
        { month: '2025-11', came: 4, reports: 2 },
        { month: '2026-01', came: 8, reports: 0 },
      ],
      80,
    );
    expect(bars).toEqual([
      {
        month: '2025-11',
        label: 'Nov 2025',
        came: 4,
        reports: 2,
        cameHeight: 40,
        reportsHeight: 20,
      },
      { month: '2025-12', label: 'Dec 2025', came: 0, reports: 0, cameHeight: 0, reportsHeight: 0 },
      {
        month: '2026-01',
        label: 'Jan 2026',
        came: 8,
        reports: 0,
        cameHeight: 80,
        reportsHeight: 0,
      },
    ]);
    expect(monthBars([], 80)).toEqual([]);
  });

  it("draws a year's twelve months, January to December, whatever months had something", () => {
    const bars = monthBars(
      [
        { month: '2026-10', came: 7, reports: 0 },
        { month: '2026-11', came: 0, reports: 1 },
      ],
      70,
      2026,
    );
    expect(bars.map((bar) => bar.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
    expect(bars[9]).toMatchObject({ label: 'Oct 2026', came: 7, cameHeight: 70 });
    expect(bars[0]).toMatchObject({ label: 'Jan 2026', came: 0, cameHeight: 0 });
    expect(monthBars([], 70, 2026)).toEqual([]);
  });

  it('names every month under a year or less of bars, and only the years under more', () => {
    const year = monthBars([{ month: '2026-10', came: 1, reports: 0 }], 70, 2026);
    expect(year.map((_, index) => barCaption(year, index))).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
    const two = monthBars(
      [
        { month: '2026-10', came: 1, reports: 0 },
        { month: '2026-11', came: 1, reports: 0 },
      ],
      70,
    );
    expect([barCaption(two, 0), barCaption(two, 1)]).toEqual(['Oct', 'Nov']);
    const long = monthBars(
      [
        { month: '2025-06', came: 1, reports: 0 },
        { month: '2026-11', came: 1, reports: 0 },
      ],
      70,
    );
    const captions = long.map((_, index) => barCaption(long, index));
    expect(captions.filter((one) => one !== null)).toEqual(['2025', '2026']);
    expect(captions[7]).toBe('2026');
    expect(barCaption(long, 99)).toBeNull();
  });

  it('gives the bars as rows of a table, for whoever cannot see the chart (B1)', () => {
    const bars = monthBars([{ month: '2026-01', came: 8, reports: 1 }], 80);
    expect(monthTable(bars)).toEqual({
      head: ['Month', 'What you came to', 'Reports at stops that counted'],
      rows: [['Jan 2026', '8', '1']],
    });
  });
});
