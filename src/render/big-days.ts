import type { V2Message } from '../discord/party-gateway.js';
import { numberWord } from './number-words.js';
import { container, LIST_COLOUR, textDisplay } from './v2.js';

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

/**
 * A line of "On this day", the day as the page labels it (B8, `bigDayLabel`): "Six years ago
 * today: Mewtwo day, 180 of 412 raids.", or "Six years ago today: 412 raids.".
 */
export function onThisDayLine(
  years: number,
  boss: DayBossWords | undefined,
  raids: number,
): string {
  return `${yearsAgoWords(years)}: ${bigDayLabel(boss, raids)}.`;
}

/**
 * The title of "On this day", with today's date: "On this day, October 8, 2026" (the year too, so
 * that a post of the date of another year is never taken for today's after a restart).
 */
export function onThisDayTitle(today: string): string {
  return `On this day, ${dateOf(today, { month: 'long', day: 'numeric', year: 'numeric' })}`;
}

/** A year's line of "On this day": how many years ago, the boss that named the day, its raids. */
export interface OnThisDayYear {
  years: number;
  boss: DayBossWords | undefined;
  raids: number;
}

/**
 * The post "On this day" in the events forum (plan 8H-8): one container, its title with today's
 * date, a line a year (newest first, as given), and in small print a link to the server's history
 * page where the server has a web address. Nobody is named, nothing pings.
 */
export function onThisDayMessage(
  today: string,
  years: readonly OnThisDayYear[],
  historyUrl?: string,
): V2Message {
  const text = [
    `## ${onThisDayTitle(today)}`,
    ...years.map((one) => onThisDayLine(one.years, one.boss, one.raids)),
    ...(historyUrl === undefined ? [] : [`-# [This server’s history](<${historyUrl}>)`]),
  ].join('\n');
  return { v2: true, components: [container(LIST_COLOUR, [textDisplay(text)])] };
}
