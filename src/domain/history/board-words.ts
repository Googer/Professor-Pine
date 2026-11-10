/*
 * The boards of plan 8H-6 (design Part D) and their words, apart from the boards themselves so
 * that the web page, whose type check has no Temporal, can import them (as `tally-periods.ts`).
 */

import { PERIOD_WORDS, type TallyPeriod } from './tally-periods.js';

/** The boards of people: what others confirmed a member did (the design's rule 3). */
export const PEOPLE_BOARDS = ['raids', 'trains', 'meetups', 'reports'] as const;
export type PeopleBoard = (typeof PEOPLE_BOARDS)[number];

/** The boards of things (Matt, Q3): nobody is named on them. */
export const THING_BOARDS = ['wanted', 'sent', 'tasks'] as const;
export type ThingBoard = (typeof THING_BOARDS)[number];

export const BOARDS = [...PEOPLE_BOARDS, ...THING_BOARDS] as const;
export type BoardName = (typeof BOARDS)[number];

/** As many as a board shows. */
export const BOARD_SIZE = 10;

/** Whether a text is a board (a custom id's argument, a query). */
export function isBoardName(text: string | undefined): text is BoardName {
  return BOARDS.some((board) => board === text);
}

/** Whether a board ranks members. */
export function isPeopleBoard(board: BoardName): board is PeopleBoard {
  return PEOPLE_BOARDS.some((one) => one === board);
}

/** A board as a choice or a tab names it. */
export const BOARD_LABELS: Readonly<Record<BoardName, string>> = {
  raids: 'Raids reported',
  trains: 'Trains conducted',
  meetups: 'Meetups hosted',
  reports: 'Reports at stops',
  wanted: 'Most wanted',
  sent: 'Most sent',
  tasks: 'Most reported tasks',
};

/** What a board ranks, as its title says it before the period. */
export const BOARD_TITLES: Readonly<Record<BoardName, string>> = {
  raids: 'Raids reported that others completed',
  trains: 'Trains conducted that others came to',
  meetups: 'Meetups hosted that others came to',
  reports: 'Reports at stops that counted',
  wanted: 'The most wanted Pokémon',
  sent: 'The bosses whose raids were sent to the most members',
  tasks: 'The field research tasks reported most',
};

/**
 * A board's title: "Raids reported that others completed, this month"; the most wanted, which
 * goes by the latest day of want counts, has no period.
 */
export function boardTitle(board: BoardName, period: TallyPeriod): string {
  return board === 'wanted'
    ? BOARD_TITLES[board]
    : `${BOARD_TITLES[board]}, ${PERIOD_WORDS[period]}`;
}

/** What a board says where it has nothing to show. */
export function emptyBoardText(board: BoardName, period: TallyPeriod, counted: boolean): string {
  if (board === 'wanted')
    return counted ? 'Nobody wants a Pokémon yet.' : 'No wants are counted yet.';
  const when = period === 'all' ? 'yet' : PERIOD_WORDS[period];
  return isPeopleBoard(board) ? `Nobody is ranked here ${when}.` : `Nothing to list ${when}.`;
}

/** The small print of the most wanted: the day its counts are of. */
export function wantedDayText(day: string): string {
  return `Wants on file as of ${day}.`;
}

/** A line's count: "12 raids", "1 train", "4 reports (9 confirmations)", "37 members". */
export function boardCountWords(board: BoardName, count: number, confirmations?: number): string {
  const n = count.toLocaleString('en-US');
  const one = count === 1;
  switch (board) {
    case 'raids':
      return `${n} ${one ? 'raid' : 'raids'}`;
    case 'trains':
      return `${n} ${one ? 'train' : 'trains'}`;
    case 'meetups':
      return `${n} ${one ? 'meetup' : 'meetups'}`;
    case 'reports': {
      const sure = confirmations ?? 0;
      const also =
        sure === 0
          ? ''
          : ` (${sure.toLocaleString('en-US')} ${sure === 1 ? 'confirmation' : 'confirmations'})`;
      return `${n} ${one ? 'report' : 'reports'}${also}`;
    }
    case 'wanted':
      return `wanted by ${n} ${one ? 'member' : 'members'}`;
    case 'sent':
      return `sent to ${n} ${one ? 'member' : 'members'}`;
    case 'tasks':
      return `${n} ${one ? 'report' : 'reports'}`;
  }
}
