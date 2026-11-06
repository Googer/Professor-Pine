import type { MemberStats } from '../domain/history/member-stats.js';
import {
  anonymousNote,
  bossesWords,
  confirmationsNote,
  MEMBER_STAT_LABELS,
  membersWords,
} from '../domain/history/member-stats-words.js';
import { IN_SETTINGS } from './settings-words.js';

/** What a member's card shows beside their numbers, as the caller names it. */
export interface MemberStatsView {
  stats: MemberStats;
  /** The card's title: "Your Pine, all time", "Pine of **Ash** in 2026". */
  title: string;
  /** Whether it says how many of a count were anonymous (the private card; a shared one has none). */
  own: boolean;
  /** The busiest region as the card names it (its channel); undefined to leave it out. */
  region?: string;
  /** The catalogue's name of a boss by its key; one it does not name is left out. */
  bossName: (bossKey: string) => string | undefined;
}

const n = (count: number): string => `**${count.toLocaleString('en-US')}**`;

/** A member's card's title: "Your Pine, all time", "Your Pine in 2026"; `whose` for another's. */
export function memberStatsTitle(year: number | null, whose = 'Your Pine'): string {
  return year === null ? `${whose}, all time` : `${whose} in ${String(year)}`;
}

/**
 * A member's card as texts (plan 8H-6, design Part E): what others confirmed first, the counts
 * of the boards (with how many were anonymous, on no board, on their own card), then their own:
 * what they completed and came to, their busiest region, the bosses they did most, and what was
 * sent to how many members. Rule 2: a place only as a region.
 */
export function memberStatsTexts(view: MemberStatsView): string[] {
  const { stats } = view;
  const L = MEMBER_STAT_LABELS;
  const anonymous = (count: number): string => (view.own ? anonymousNote(count) : '');
  const confirmed = [
    `### ${view.title}`,
    `${L.raids}: ${n(stats.raids.count)}${anonymous(stats.raids.anonymous)}`,
    `${L.trains}: ${n(stats.trains.count)}${anonymous(stats.trains.anonymous)}`,
    `${L.meetups}: ${n(stats.meetups.count)}${anonymous(stats.meetups.anonymous)}`,
    `${L.reports}: ${n(stats.reports.count)}${confirmationsNote(stats.reports.confirmations)}`,
  ].join('\n');
  const bosses = stats.bosses.flatMap((boss) => {
    const name = view.bossName(boss.bossKey);
    return name === undefined ? [] : [{ name, count: boss.count }];
  });
  const [sent, ...members] = membersWords(stats.sent).split(' ');
  const own = [
    `${L.completed}: ${n(stats.completed)}`,
    `${L.trainsCame}: ${n(stats.trainsCame)} · ${L.meetupsCame}: ${n(stats.meetupsCame)}`,
    ...(view.region === undefined ? [] : [`${L.region}: ${view.region}`]),
    ...(bosses.length === 0 ? [] : [`${L.bosses}: ${bossesWords(bosses)}`]),
    `${L.sent} **${sent ?? ''}** ${members.join(' ')}`,
  ].join('\n');
  return [confirmed, own];
}

/**
 * What `/stats me` says to a member without the history opt-in (design Part E; S6: in short
 * words, `/help settings` says the rest). `settings`: where they turn it on, as Discord says it
 * unless a page says it (`IN_SETTINGS_ON_DISCORD`).
 */
export function notOptedIn(settings: string = IN_SETTINGS): string {
  return (
    'Your history is off in this server, so I have nothing of yours to count. Turn it on ' +
    `${settings}, and I count what you do from then on.`
  );
}

/** What `/stats me` says of a year without anything of the member's. */
export function nothingInYear(year: number): string {
  return `Nothing of yours is in my history of this server for ${String(year)}.`;
}
