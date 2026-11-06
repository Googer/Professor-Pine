import { numberWord } from './number-words.js';

/*
 * The words of big days (plan 8H-8), for the history page (through its routes) and the events
 * forum's "On this day" alike. A day is a `yyyy-mm-dd` calendar date: it is written as the date it
 * is (UTC is only the means of reading it), never moved by a zone.
 */

/** The boss that names a day, by the catalogue's name, and its raids that day. */
export interface DayBossWords {
  name: string;
  raids: number;
}

const count = (n: number): string => n.toLocaleString('en-US');
const raidsWords = (n: number): string => `${count(n)} ${n === 1 ? 'raid' : 'raids'}`;

/** A date of a `yyyy-mm-dd` day, written by `options` in English. */
function dateOf(day: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1)).toLocaleDateString('en-US', {
    ...options,
    timeZone: 'UTC',
  });
}

/** "Tuesday, October 8, 2019". */
export function dayDateWords(day: string): string {
  return dateOf(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "Oct 8": the chart's label of a big day. */
export function dayShortWords(day: string): string {
  return dateOf(day, { month: 'short', day: 'numeric' });
}

/**
 * What a big day is called (G11), one form for the page and the post (B8): "Mewtwo day, 180 of
 * 412 raids" where a boss names it (`BigDay.label`), else "412 raids".
 */
export function bigDayLabel(boss: DayBossWords | undefined, raids: number): string {
  return boss === undefined
    ? raidsWords(raids)
    : `${boss.name} day, ${count(boss.raids)} of ${raidsWords(raids)}`;
}

/** "One year ago today", "Six years ago today", "12 years ago today" (G13). */
export function yearsAgoWords(years: number): string {
  const words = `${numberWord(years)} ${years === 1 ? 'year' : 'years'} ago today`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A line of "On this day": "Six years ago today: 180 Mewtwo raids, 412 raids in all." */
export function onThisDayLine(
  years: number,
  boss: DayBossWords | undefined,
  raids: number,
): string {
  return boss === undefined
    ? `${yearsAgoWords(years)}: ${raidsWords(raids)}.`
    : `${yearsAgoWords(years)}: ${count(boss.raids)} ${boss.name} ${boss.raids === 1 ? 'raid' : 'raids'}, ${raidsWords(raids)} in all.`;
}

/** The title of "On this day": "On this day, October 8". */
export function onThisDayTitle(today: string): string {
  return `On this day, ${dateOf(today, { month: 'long', day: 'numeric' })}`;
}
